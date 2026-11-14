"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Loader2,
  FileUp,
  FileText,
  X,
  Check,
  Camera,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { KaTeXRenderer } from "@/components/katex-renderer";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_DOCUMENT_TYPES,
  batchUnits,
  cropImage,
  extractDocument,
  modelBoxToImage,
  padBox,
  pageImageData,
  parsePageRange,
  releaseDocument,
  type CropBox,
  type DocImage,
  type DocUnit,
  type ExtractedDocument,
} from "@/lib/documents/extract";
import { SnapshotPicker } from "./snapshot-picker";

export interface GeneratedQuestion {
  kind: "mcq_single" | "mcq_multi";
  stem: string;
  options: Array<{ label: string; is_correct: boolean; position: number }>;
  explanation: string | null;
  points: number;
  /** Snapshot taken from an uploaded document, attached as the question image. */
  image?: Blob | null;
}

interface Props {
  onGenerated: (questions: GeneratedQuestion[]) => void;
}

interface UploadedDocument extends ExtractedDocument {
  key: string;
  pageRange: string;
}

interface Snapshot {
  imageId: number;
  box: CropBox;
  blob: Blob;
  url: string;
}

interface ReviewItem {
  question: GeneratedQuestion;
  included: boolean;
  snapshot: Snapshot | null;
}

interface ApiQuestion extends GeneratedQuestion {
  figure?: { imageId: number; box: CropBox } | null;
}

const MAX_FILE_SIZE = 40 * 1024 * 1024;
/** Per-request limit on the server; larger totals are split across parts. */
const MAX_PER_REQUEST = 50;
const MAX_TOPIC_QUESTIONS = 50;
const MAX_DOCUMENT_QUESTIONS = 200;

/** Units of each document that fall inside its page range. */
function selectUnits(documents: UploadedDocument[]): DocUnit[] {
  return documents.flatMap((doc) => {
    const pages = doc.kind === "pdf" ? parsePageRange(doc.pageRange) : null;
    return pages
      ? doc.units.filter((u) => u.page !== undefined && pages.has(u.page))
      : doc.units;
  });
}

function sumQuestions(units: DocUnit[]) {
  return units.reduce((n, u) => n + (u.questionCount ?? 0), 0);
}

function ProgressBar({ label, percent }: { label: string; percent: number }) {
  const value = Math.round(Math.min(100, Math.max(0, percent)));
  return (
    <div
      className="grid gap-1.5"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-foreground">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function AIGenerateModal({ onGenerated }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgressState] = useState({ label: "", percent: 0 });
  const setProgress = (label: string, percent = 0) => setProgressState({ label, percent });
  const [config, setConfig] = useState({
    count: 5,
    discipline: "",
    questionType: "mcq_single" as "mcq_single" | "mcq_multi" | "mixed",
    difficulty: "medium" as "easy" | "medium" | "hard" | "mixed",
    prompt: "",
    language: "English",
    mode: "create" as "create" | "import",
  });

  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [reading, setReadingState] = useState({ label: "", percent: 0 });
  const setReading = (label: string, percent = 0) => setReadingState({ label, percent });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [snapshotFor, setSnapshotFor] = useState<number | null>(null);

  const allImages = useMemo<DocImage[]>(
    () => documents.flatMap((d) => d.units.flatMap((u) => u.images)),
    [documents]
  );
  const hasDocuments = documents.length > 0;

  // Questions found in the selected pages. When the documents already contain
  // questions, that number becomes the number to generate.
  const detected = useMemo(() => sumQuestions(selectUnits(documents)), [documents]);
  const maxCount = hasDocuments ? MAX_DOCUMENT_QUESTIONS : MAX_TOPIC_QUESTIONS;
  useEffect(() => {
    if (detected > 0) {
      setConfig((c) => ({ ...c, count: Math.min(MAX_DOCUMENT_QUESTIONS, detected) }));
    }
  }, [detected]);

  // Free object URLs when the editor page goes away.
  const cleanupRef = useRef<() => void>(() => {});
  cleanupRef.current = () => {
    documents.forEach(releaseDocument);
    review?.forEach((r) => r.snapshot && URL.revokeObjectURL(r.snapshot.url));
  };
  useEffect(() => () => cleanupRef.current(), []);

  async function addFiles(files: File[]) {
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} is larger than 40 MB`);
        continue;
      }
      setReading(`${file.name}: reading`, 2);
      try {
        // Reading the file is the first 60% of the bar, counting the rest.
        const doc = await extractDocument(file, (message, fraction) =>
          setReading(message, 2 + fraction * 58)
        );
        const hasContent = doc.units.some((u) => u.text.trim() || u.images.length);
        if (!hasContent) {
          toast.error(`${file.name}: nothing readable was found`);
          continue;
        }
        doc.notes.forEach((note) => toast.info(`${file.name}: ${note}`));
        const found = await countDocumentQuestions(doc.units, file.name);
        if (found > 0) {
          setConfig((c) => ({ ...c, mode: "import" }));
          toast.success(
            `${file.name}: ${found} question${found === 1 ? "" : "s"} found`
          );
        }
        setDocuments((docs) => [
          ...docs,
          { ...doc, key: `${file.name}-${Date.now()}`, pageRange: "" },
        ]);
      } catch (err) {
        console.error("Document read error:", err);
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : `Could not read ${file.name}`
        );
      }
    }
    setReading("");
  }

  /**
   * Ask the model how many questions each unit (page) holds and record it on
   * the units. Pages with extractable text are sent as text only, so this is
   * much lighter than generation. Returns the total, or 0 if counting failed.
   */
  async function countDocumentQuestions(units: DocUnit[], name: string) {
    const light = units.map((u) =>
      u.text.trim().length > 80 ? { ...u, images: [] } : u
    );
    const batches = batchUnits(light);
    let offset = 0;
    let total = 0;
    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i] ?? [];
        setReading(
          batches.length > 1
            ? `${name}: counting questions (part ${i + 1} of ${batches.length})`
            : `${name}: counting questions`,
          60 + (i / batches.length) * 40
        );
        const res = await fetch("/api/internal/ai/count-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            units: batch.map((u) => ({
              text: u.text,
              images: u.images.map((img) => ({ data: img.modelData })),
            })),
          }),
        });
        if (!res.ok) throw new Error(`count failed (${res.status})`);
        const counts: unknown = (await res.json()).counts;
        batch.forEach((_, j) => {
          const unit = units[offset + j];
          const n = Array.isArray(counts) ? Number(counts[j]) || 0 : 0;
          if (unit) unit.questionCount = n;
          total += n;
        });
        offset += batch.length;
      }
      return total;
    } catch (err) {
      console.error("Question count error:", err);
      units.forEach((u) => delete u.questionCount);
      toast.info(`${name}: could not count the questions — set the number yourself`);
      return 0;
    }
  }

  function removeDocument(key: string) {
    setDocuments((docs) => {
      const doc = docs.find((d) => d.key === key);
      if (doc) releaseDocument(doc);
      return docs.filter((d) => d.key !== key);
    });
  }

  async function makeSnapshot(imageId: number, box: CropBox): Promise<Snapshot | null> {
    const image = allImages.find((i) => i.id === imageId);
    if (!image) return null;
    try {
      const blob = await cropImage(image, box);
      return { imageId, box, blob, url: URL.createObjectURL(blob) };
    } catch {
      return null;
    }
  }

  /**
   * Turn the figure the generator pointed at into a snapshot. Its box comes
   * from a many-page request and is only approximate, so for whole pages the
   * figure is located again on that page alone; the rough box is the fallback.
   */
  async function snapshotFromModel(imageId: number, roughBox: CropBox, stem: string) {
    const image = allImages.find((i) => i.id === imageId);
    if (!image) return null;
    let box = modelBoxToImage(image, roughBox);
    if (image.isPage) {
      try {
        const res = await fetch("/api/internal/ai/locate-figure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: await pageImageData(image), stem }),
        });
        const data = res.ok ? await res.json() : null;
        if (data?.box) box = padBox(data.box as CropBox);
      } catch {
        // keep the rough box
      }
    }
    return makeSnapshot(imageId, box);
  }

  async function requestQuestions(body: Record<string, unknown>): Promise<ApiQuestion[]> {
    const res = await fetch("/api/internal/ai/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Generation failed (${res.status})`);
    }
    const data = await res.json();
    return Array.isArray(data.questions) ? data.questions : [];
  }

  async function handleGenerate() {
    const units = hasDocuments ? selectUnits(documents) : [];
    if (!hasDocuments && !config.discipline.trim()) {
      toast.error("Specify a discipline/subject or upload a document");
      return;
    }
    if (hasDocuments && units.length === 0) {
      toast.error("The page ranges don't match any page of the uploaded documents");
      return;
    }

    setLoading(true);
    const collected: ApiQuestion[] = [];
    try {
      if (!hasDocuments) {
        setProgress("Generating questions…", 15);
        collected.push(
          ...(await requestQuestions({
            ...config,
            count: Math.min(MAX_TOPIC_QUESTIONS, config.count),
          }))
        );
      } else {
        const batches = batchUnits(units);
        // "create": share the requested count across batches by size.
        // "import": ask each batch for the questions counted in it (or, if the
        // count is unknown, whatever it holds) until the total is reached.
        const shares = shareCount(
          config.count,
          batches.map((b) => b.length)
        );
        const counted = units.some((u) => u.questionCount !== undefined);
        for (let i = 0; i < batches.length; i++) {
          const remaining = config.count - collected.length;
          const inBatch = sumQuestions(batches[i] ?? []);
          const want = Math.min(
            MAX_PER_REQUEST,
            config.mode === "import"
              ? Math.min(remaining, counted ? inBatch : MAX_PER_REQUEST)
              : shares[i] ?? 0
          );
          if (want <= 0) continue;
          // Generation is the first 70% of the bar; snapshots are the rest.
          setProgress(
            `${config.mode === "import" ? "Importing" : "Generating"} questions` +
              (batches.length > 1 ? ` — part ${i + 1} of ${batches.length}` : "") +
              ` (${collected.length} of ${config.count} done)`,
            5 + (i / batches.length) * 65
          );
          try {
            const questions = await requestQuestions({
              ...config,
              count: want,
              units: (batches[i] ?? []).map((u) => ({
                label: u.label,
                text: u.text,
                images: u.images.map((img) => ({
                  id: img.id,
                  label: img.label,
                  data: img.modelData,
                })),
              })),
            });
            collected.push(...questions);
          } catch (err) {
            // Keep what earlier parts produced rather than losing everything.
            if (collected.length === 0) throw err;
            toast.error(
              `Part ${i + 1} failed: ${err instanceof Error ? err.message : "error"}`
            );
          }
        }
      }

      const usable = collected.filter((q) => q.stem && q.options?.length >= 2);
      if (usable.length === 0) {
        toast.error(
          config.mode === "import" && hasDocuments
            ? "No questions were found in the document"
            : "No questions generated"
        );
        return;
      }

      const items: ReviewItem[] = usable.map((q) => ({
        question: {
          kind: q.kind,
          stem: q.stem,
          options: q.options,
          explanation: q.explanation,
          points: q.points,
        },
        included: true,
        snapshot: null,
      }));
      // Locate figures a few at a time to keep generation quick.
      const pending = usable.flatMap((q, index) => (q.figure ? [{ index, figure: q.figure }] : []));
      let captured = 0;
      const snapshotProgress = () =>
        setProgress(
          pending.length
            ? `Capturing pictures — ${captured} of ${pending.length}`
            : "Preparing review…",
          70 + (pending.length ? (captured / pending.length) * 30 : 30)
        );
      snapshotProgress();
      for (let i = 0; i < pending.length; i += 4) {
        await Promise.all(
          pending.slice(i, i + 4).map(async ({ index, figure }) => {
            const item = items[index];
            if (!item) return;
            item.snapshot = await snapshotFromModel(
              figure.imageId,
              figure.box,
              item.question.stem
            );
            captured++;
            snapshotProgress();
          })
        );
      }
      setReview(items);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Network error. Please try again."
      );
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  function updateItem(index: number, patch: Partial<ReviewItem>) {
    setReview((items) =>
      items ? items.map((item, i) => (i === index ? { ...item, ...patch } : item)) : items
    );
  }

  function setSnapshot(index: number, snapshot: Snapshot | null) {
    const previous = review?.[index]?.snapshot;
    if (previous) URL.revokeObjectURL(previous.url);
    updateItem(index, { snapshot });
  }

  function discardReview() {
    review?.forEach((r) => r.snapshot && URL.revokeObjectURL(r.snapshot.url));
    setReview(null);
    setSnapshotFor(null);
  }

  function handleAddToQuiz() {
    if (!review) return;
    const chosen = review.filter((r) => r.included);
    if (chosen.length === 0) {
      toast.error("Select at least one question");
      return;
    }
    onGenerated(
      chosen.map((r) => ({ ...r.question, image: r.snapshot?.blob ?? null }))
    );
    // The editor now owns the blobs; only the preview URLs are released.
    discardReview();
    setOpen(false);
  }

  const includedCount = review?.filter((r) => r.included).length ?? 0;
  const snapshotItem = snapshotFor !== null ? review?.[snapshotFor] : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && loading) return;
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Sparkles className="mr-2 h-4 w-4" />
            AI Generate
          </Button>
        }
      />
      <DialogContent
        className={cn(
          "max-h-[92vh] overflow-y-auto",
          review ? "sm:max-w-4xl" : "sm:max-w-xl"
        )}
      >
        {snapshotItem && snapshotFor !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>Snapshot a picture for question {snapshotFor + 1}</DialogTitle>
              <DialogDescription className="line-clamp-2">
                {snapshotItem.question.stem}
              </DialogDescription>
            </DialogHeader>
            <SnapshotPicker
              images={allImages}
              initialImageId={snapshotItem.snapshot?.imageId}
              initialBox={snapshotItem.snapshot?.box}
              onCancel={() => setSnapshotFor(null)}
              onApply={async (imageId, box) => {
                const snapshot = await makeSnapshot(imageId, box);
                if (!snapshot) {
                  toast.error("Could not take the snapshot");
                  return;
                }
                setSnapshot(snapshotFor, snapshot);
                setSnapshotFor(null);
              }}
            />
          </>
        ) : review ? (
          <>
            <DialogHeader>
              <DialogTitle>Review generated questions</DialogTitle>
              <DialogDescription>
                Untick anything you don&apos;t want.
                {allImages.length > 0 &&
                  " Pictures were snapshotted from your documents — adjust, add or remove them before saving."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid max-h-[62vh] gap-3 overflow-y-auto pr-1">
              {review.map((item, index) => (
                <div
                  key={index}
                  className={cn(
                    "rounded-lg border border-border p-3 transition",
                    !item.included && "opacity-50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-primary"
                      checked={item.included}
                      onChange={(e) => updateItem(index, { included: e.target.checked })}
                      aria-label={`Include question ${index + 1}`}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-muted-foreground">
                          {index + 1}.
                        </span>
                        <div className="min-w-0 flex-1 text-sm">
                          <KaTeXRenderer text={item.question.stem} />
                        </div>
                        {item.question.kind === "mcq_multi" && (
                          <Badge variant="outline" className="shrink-0">
                            Multi
                          </Badge>
                        )}
                      </div>

                      <ul className="grid gap-1 sm:grid-cols-2">
                        {item.question.options.map((opt, optIdx) => (
                          <li
                            key={optIdx}
                            className={cn(
                              "flex items-start gap-1.5 rounded-md px-2 py-1 text-xs",
                              opt.is_correct
                                ? "bg-green-500/10 text-green-700 dark:text-green-400"
                                : "text-muted-foreground"
                            )}
                          >
                            <span className="font-medium">
                              {String.fromCharCode(65 + optIdx)}.
                            </span>
                            <span className="min-w-0 flex-1">
                              <KaTeXRenderer text={opt.label} />
                            </span>
                            {opt.is_correct && <Check className="h-3 w-3 shrink-0" />}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {allImages.length > 0 && (
                      <div className="flex w-36 shrink-0 flex-col items-stretch gap-1.5">
                        {item.snapshot ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.snapshot.url}
                              alt={`Picture for question ${index + 1}`}
                              className="max-h-28 w-full rounded-md border border-border bg-white object-contain"
                            />
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 flex-1 px-2 text-xs"
                                onClick={() => setSnapshotFor(index)}
                              >
                                <Camera className="mr-1 h-3 w-3" />
                                Adjust
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Remove picture"
                                onClick={() => setSnapshot(index, null)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => setSnapshotFor(index)}
                          >
                            <Camera className="mr-1 h-3 w-3" />
                            Add picture
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" onClick={discardReview}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Discard &amp; go back
              </Button>
              <Button onClick={handleAddToQuiz} disabled={includedCount === 0}>
                Add {includedCount} question{includedCount === 1 ? "" : "s"} to quiz
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generate Questions with AI</DialogTitle>
              <DialogDescription>
                Describe a subject, or upload documents to base the questions on. Diagrams the
                questions need are snapshotted from the document automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              {/* Source documents */}
              <div className="grid gap-1.5">
                <Label className="text-xs">Source documents (optional)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_DOCUMENT_TYPES}
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (files.length) addFiles(files);
                  }}
                />
                <button
                  type="button"
                  disabled={!!reading.label || loading}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const files = Array.from(e.dataTransfer.files);
                    if (files.length) addFiles(files);
                  }}
                  className={cn(
                    "flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-4 text-sm transition",
                    dragOver
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted-foreground/25 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
                  )}
                >
                  {reading.label ? (
                    <div className="w-full max-w-sm py-1 text-left">
                      <ProgressBar label={reading.label} percent={reading.percent} />
                    </div>
                  ) : (
                    <>
                      <FileUp className="h-5 w-5" />
                      <span className="font-medium">Upload documents</span>
                      <span className="text-xs">
                        PDF, DOCX, text/Markdown or page images — drag &amp; drop or click
                      </span>
                    </>
                  )}
                </button>

                {documents.map((doc) => {
                  const pictures = doc.units.reduce((n, u) => n + u.images.length, 0);
                  const questions = sumQuestions(doc.units);
                  return (
                    <div
                      key={doc.key}
                      className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium">{doc.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {doc.kind === "pdf"
                          ? `${doc.units.length} page${doc.units.length === 1 ? "" : "s"}`
                          : doc.kind === "docx"
                          ? `${pictures} picture${pictures === 1 ? "" : "s"}`
                          : doc.kind}
                        {questions > 0 &&
                          ` · ${questions} question${questions === 1 ? "" : "s"}`}
                      </span>
                      {doc.kind === "pdf" && doc.units.length > 1 && (
                        <Input
                          value={doc.pageRange}
                          onChange={(e) =>
                            setDocuments((docs) =>
                              docs.map((d) =>
                                d.key === doc.key ? { ...d, pageRange: e.target.value } : d
                              )
                            )
                          }
                          placeholder="All pages"
                          title="Pages to use, e.g. 1-5, 8"
                          aria-label={`Pages to use from ${doc.name}`}
                          className="h-6 w-24 px-2 text-xs"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeDocument(doc.key)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Remove document"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {hasDocuments && (
                <div className="grid gap-1.5">
                  <Label className="text-xs">What to do with the documents</Label>
                  <Select
                    value={config.mode}
                    onValueChange={(v) =>
                      setConfig({ ...config, mode: v as "create" | "import" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {config.mode === "import"
                          ? "Import the questions already in the document"
                          : "Write new questions from the content"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="create">
                        Write new questions from the content
                      </SelectItem>
                      <SelectItem value="import">
                        Import the questions already in the document
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="ai-count" className="text-xs">
                    Number of Questions
                    {detected > 0 && ` (${detected} found in document)`}
                  </Label>
                  <Input
                    id="ai-count"
                    type="number"
                    min={1}
                    max={maxCount}
                    value={config.count}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        count: Math.min(maxCount, Math.max(1, parseInt(e.target.value) || 5)),
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ai-language" className="text-xs">
                    Language
                  </Label>
                  <Input
                    id="ai-language"
                    value={config.language}
                    onChange={(e) => setConfig({ ...config, language: e.target.value })}
                    placeholder="English"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ai-discipline" className="text-xs">
                  Discipline / Subject{hasDocuments && " (optional)"}
                </Label>
                <Input
                  id="ai-discipline"
                  value={config.discipline}
                  onChange={(e) => setConfig({ ...config, discipline: e.target.value })}
                  placeholder="e.g. Physics, Biology, Mathematics, History..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Question Type</Label>
                  <Select
                    value={config.questionType}
                    onValueChange={(v) =>
                      setConfig({
                        ...config,
                        questionType: v as "mcq_single" | "mcq_multi" | "mixed",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {{ mcq_single: "Single Answer", mcq_multi: "Multiple Answer", mixed: "Mixed" }[config.questionType]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mcq_single">Single Answer</SelectItem>
                      <SelectItem value="mcq_multi">Multiple Answer</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Difficulty</Label>
                  <Select
                    value={config.difficulty}
                    disabled={hasDocuments && config.mode === "import"}
                    onValueChange={(v) =>
                      setConfig({
                        ...config,
                        difficulty: v as "easy" | "medium" | "hard" | "mixed",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue className="capitalize" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ai-prompt" className="text-xs">
                  Additional Prompt (optional)
                </Label>
                <textarea
                  id="ai-prompt"
                  className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={config.prompt}
                  onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
                  placeholder={
                    hasDocuments
                      ? "e.g. Focus on chapter 2. Prefer questions that use the diagrams..."
                      : "e.g. Focus on kinematics and Newton's laws. Include questions with formulas..."
                  }
                />
              </div>
            </div>

            {loading && (
              <ProgressBar label={progress.label || "Starting…"} percent={progress.percent} />
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={loading || !!reading.label}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Working…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Split `total` across buckets in proportion to their sizes (largest remainder). */
function shareCount(total: number, sizes: number[]) {
  const sum = sizes.reduce((a, b) => a + b, 0) || 1;
  const exact = sizes.map((s) => (total * s) / sum);
  const shares = exact.map(Math.floor);
  let left = total - shares.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    shares[i] = (shares[i] ?? 0) + 1;
    left--;
  }
  return shares;
}
