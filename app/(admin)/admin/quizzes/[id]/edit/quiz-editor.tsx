"use client";

import { useState, useTransition, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, GripVertical, Trash2, Check, ImagePlus, X, Eye, Code, Sigma } from "lucide-react";
import { addQuestion, updateQuestion, deleteQuestion, addOption, updateOption, deleteOption } from "@/lib/actions/question";
import { KaTeXRenderer } from "@/components/katex-renderer";
import { MathEditor } from "@/components/math-editor";
import { cn } from "@/lib/utils";
import { AIGenerateModal } from "./ai-generate-modal";
import Link from "next/link";
import { toast } from "sonner";

interface QuizData {
  id: string;
  title: string;
  slug: string;
  description: string | null;
}

interface VersionData {
  id: string;
  version: number;
  status: string;
  time_limit_seconds: number | null;
  per_question_seconds: number | null;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  allow_backtrack: boolean;
  show_feedback: string;
  passing_score: number | null;
}

interface OptionData {
  id: string;
  label: Record<string, unknown>;
  is_correct: boolean;
  position: number;
  media_key: string | null;
  media_alt: string | null;
}

interface QuestionData {
  id: string;
  kind: string;
  content_kind: string;
  stem: Record<string, unknown>;
  points: number;
  time_seconds: number | null;
  numeric_answer: number | null;
  numeric_tolerance: number;
  numeric_unit: string | null;
  explanation: Record<string, unknown> | null;
  media_key: string | null;
  media_alt: string | null;
  position: number;
  question_options: OptionData[];
}

interface Props {
  quiz: QuizData;
  version: VersionData;
  questions: QuestionData[];
}

export function QuizEditor({ quiz, version, questions: initialQuestions }: Props) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  const currentQuestion = questions[selectedIndex] ?? null;

  const [previewStem, setPreviewStem] = useState(false);
  const [previewOptions, setPreviewOptions] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [optionImageTarget, setOptionImageTarget] = useState<{ optionId: string; letter: string } | null>(null);
  const [optionImageDragOver, setOptionImageDragOver] = useState(false);
  const optionImageInputRef = useRef<HTMLInputElement>(null);
  const [mathTarget, setMathTarget] = useState<{ type: "stem" } | { type: "option"; optionId: string } | null>(null);
  const stemRef = useRef<HTMLTextAreaElement>(null);
  const optionInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const mathSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function openMathEditor(target: NonNullable<typeof mathTarget>) {
    // Capture cursor position before the click steals focus
    const el = target.type === "stem" ? stemRef.current : optionInputRefs.current[target.optionId];
    mathSelectionRef.current = el
      ? { start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length }
      : null;
    setMathTarget(target);
  }

  function handleMathApply(latex: string) {
    if (!mathTarget || !currentQuestion) return;
    const insert = `$${latex}$`;

    if (mathTarget.type === "stem") {
      const text = (currentQuestion.stem as { text?: string })?.text || "";
      const sel = mathSelectionRef.current;
      const next = sel
        ? text.slice(0, sel.start) + insert + text.slice(sel.end)
        : text + (text ? " " : "") + insert;
      handleStemChange(next);
    } else {
      const opt = currentQuestion.question_options.find((o) => o.id === mathTarget.optionId);
      if (!opt) return;
      const text = (opt.label as { text?: string })?.text || "";
      const sel = mathSelectionRef.current;
      const next = sel
        ? text.slice(0, sel.start) + insert + text.slice(sel.end)
        : text + (text ? " " : "") + insert;
      handleOptionLabelChange(mathTarget.optionId, next);
    }
  }

  function debouncedSave(key: string, fn: () => Promise<unknown>, delay = 600) {
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => {
      startTransition(async () => {
        await fn();
      });
    }, delay);
  }

  function handleAIGenerated(
    generated: Array<{
      kind: "mcq_single" | "mcq_multi";
      stem: string;
      options: Array<{ label: string; is_correct: boolean; position: number }>;
      explanation: string | null;
      points: number;
    }>
  ) {
    // Save each generated question to the database
    startTransition(async () => {
      const newQuestions = [...questions];
      for (const gq of generated) {
        const result = await addQuestion(quiz.id, {
          quiz_version_id: version.id,
          kind: gq.kind,
          stem: { text: gq.stem },
          points: gq.points,
          explanation: gq.explanation ? { text: gq.explanation } : null,
        });

        if (result.id) {
          // Add options
          const savedOptions: Array<{ id: string; label: Record<string, unknown>; is_correct: boolean; position: number; media_key: string | null; media_alt: string | null }> = [];
          for (const opt of gq.options) {
            const optResult = await addOption(quiz.id, {
              question_id: result.id,
              label: { text: opt.label },
              is_correct: opt.is_correct,
              position: opt.position,
            });
            if (optResult.id) {
              savedOptions.push({
                id: optResult.id,
                label: { text: opt.label },
                is_correct: opt.is_correct,
                position: opt.position,
                media_key: null,
                media_alt: null,
              });
            }
          }

          newQuestions.push({
            id: result.id,
            kind: gq.kind,
            content_kind: "text",
            stem: { text: gq.stem },
            points: gq.points,
            time_seconds: null,
            numeric_answer: null,
            numeric_tolerance: 0,
            numeric_unit: null,
            explanation: gq.explanation ? { text: gq.explanation } : null,
            media_key: null,
            media_alt: null,
            position: newQuestions.length + 1,
            question_options: savedOptions,
          });
        }
      }
      setQuestions(newQuestions);
      setSelectedIndex(newQuestions.length - 1);
      toast.success(`${generated.length} questions saved`);
    });
  }

  function handleAddQuestion(kind: "mcq_single" | "mcq_multi" | "true_false" | "numeric") {
    startTransition(async () => {
      const result = await addQuestion(quiz.id, {
        quiz_version_id: version.id,
        kind,
        stem: { text: "" },
      });

      if (result.error) {
        toast.error(result.error);
      } else if (result.id) {
        const newQ: QuestionData = {
          id: result.id,
          kind,
          content_kind: "text",
          stem: { text: "" },
          points: 1,
          time_seconds: null,
          numeric_answer: null,
          numeric_tolerance: 0,
          numeric_unit: null,
          explanation: null,
          media_key: null,
          media_alt: null,
          position: questions.length + 1,
          question_options: kind === "true_false" 
            ? [
                { id: "tf-true", label: { text: "True" }, is_correct: true, position: 1, media_key: null, media_alt: null },
                { id: "tf-false", label: { text: "False" }, is_correct: false, position: 2, media_key: null, media_alt: null },
              ]
            : [],
        };
        setQuestions([...questions, newQ]);
        setSelectedIndex(questions.length);
        setPreviewStem(false);
        toast.success("Question added");
      }
    });
  }

  function handleDeleteQuestion(questionId: string) {
    startTransition(async () => {
      const result = await deleteQuestion(quiz.id, questionId);
      if (result.error) {
        toast.error(result.error);
      } else {
        setQuestions(questions.filter((q) => q.id !== questionId));
        setSelectedIndex(Math.max(0, selectedIndex - 1));
        setDeleteConfirmOpen(false);
        toast.success("Question deleted");
      }
    });
  }

  function handleStemChange(text: string) {
    if (!currentQuestion) return;
    const updated = { ...currentQuestion, stem: { text } };
    setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));

    debouncedSave(`stem-${currentQuestion.id}`, () =>
      updateQuestion(quiz.id, currentQuestion.id, { stem: { text } })
    );
  }

  function handlePointsChange(points: number) {
    if (!currentQuestion) return;
    const updated = { ...currentQuestion, points };
    setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));

    debouncedSave(`points-${currentQuestion.id}`, () =>
      updateQuestion(quiz.id, currentQuestion.id, { points })
    );
  }

  function handleAddOption() {
    if (!currentQuestion) return;
    const questionId = currentQuestion.id;
    const tempId = `temp-${Date.now()}`;
    const position =
      Math.max(0, ...currentQuestion.question_options.map((o) => o.position)) + 1;

    // Optimistic insert
    const newOption: OptionData = {
      id: tempId,
      label: { text: "" },
      is_correct: false,
      position,
      media_key: null,
      media_alt: null,
    };
    setQuestions((qs) =>
      qs.map((q) =>
        q.id === questionId
          ? { ...q, question_options: [...q.question_options, newOption] }
          : q
      )
    );

    startTransition(async () => {
      const result = await addOption(quiz.id, {
        question_id: questionId,
        label: { text: "" },
        is_correct: false,
        position,
      });

      if (result.error) {
        toast.error(result.error);
        // Rollback
        setQuestions((qs) =>
          qs.map((q) =>
            q.id === questionId
              ? {
                  ...q,
                  question_options: q.question_options.filter(
                    (o) => o.id !== tempId
                  ),
                }
              : q
          )
        );
      } else if (result.id) {
        // Reconcile temp id with real id
        setQuestions((qs) =>
          qs.map((q) =>
            q.id === questionId
              ? {
                  ...q,
                  question_options: q.question_options.map((o) =>
                    o.id === tempId ? { ...o, id: result.id! } : o
                  ),
                }
              : q
          )
        );
      }
    });
  }

  function handleOptionLabelChange(optionId: string, text: string) {
    if (!currentQuestion) return;
    const updatedOptions = currentQuestion.question_options.map((o) =>
      o.id === optionId ? { ...o, label: { text } } : o
    );
    const updated = { ...currentQuestion, question_options: updatedOptions };
    setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));

    // Skip server save for options not yet persisted (temp ids)
    if (optionId.startsWith("temp-")) return;
    debouncedSave(`opt-${optionId}`, () =>
      updateOption(quiz.id, optionId, { label: { text } })
    );
  }

  function handleSetCorrect(optionId: string) {
    if (!currentQuestion) return;

    if (currentQuestion.kind === "mcq_multi") {
      // Toggle: allow multiple correct
      const updatedOptions = currentQuestion.question_options.map((o) =>
        o.id === optionId ? { ...o, is_correct: !o.is_correct } : o
      );
      const updated = { ...currentQuestion, question_options: updatedOptions };
      setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));

      const toggled = updatedOptions.find((o) => o.id === optionId);
      startTransition(async () => {
        await updateOption(quiz.id, optionId, { is_correct: toggled?.is_correct ?? false });
      });
    } else {
      // Single correct
      const updatedOptions = currentQuestion.question_options.map((o) => ({
        ...o,
        is_correct: o.id === optionId,
      }));
      const updated = { ...currentQuestion, question_options: updatedOptions };
      setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));

      startTransition(async () => {
        await Promise.all(
          currentQuestion.question_options.map((o) =>
            updateOption(quiz.id, o.id, { is_correct: o.id === optionId })
          )
        );
      });
    }
  }

  const handleImageUpload = useCallback(async (file: File) => {
    if (!currentQuestion) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("quizId", quiz.id);
      formData.append("questionId", currentQuestion.id);
      const uploadRes = await fetch("/api/internal/uploads", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        toast.error(err.error || "Upload failed");
        return;
      }
      const { key } = await uploadRes.json();

      // Save media_key to question
      const updated = { ...currentQuestion, media_key: key, media_alt: file.name };
      setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));

      startTransition(async () => {
        await updateQuestion(quiz.id, currentQuestion.id, { media_key: key, media_alt: file.name });
      });

      toast.success("Image uploaded");
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploading(false);
    }
  }, [currentQuestion, quiz.id, questions, selectedIndex, startTransition]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      handleImageUpload(file);
    } else if (e.dataTransfer.files.length > 0) {
      toast.error("Only image files are supported");
    }
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!currentQuestion || optionImageTarget) return;
      const items = e.clipboardData?.items
        ? Array.from(e.clipboardData.items)
        : [];
      let file =
        items
          .find((item) => item.kind === "file" && item.type.startsWith("image/"))
          ?.getAsFile() ?? null;
      if (!file && e.clipboardData?.files) {
        file =
          Array.from(e.clipboardData.files).find((f) =>
            f.type.startsWith("image/")
          ) ?? null;
      }
      if (file) {
        e.preventDefault();
        handleImageUpload(file);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [currentQuestion, handleImageUpload, optionImageTarget]);

  function handleRemoveImage() {
    if (!currentQuestion) return;
    const updated = { ...currentQuestion, media_key: null, media_alt: null };
    setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));

    startTransition(async () => {
      await updateQuestion(quiz.id, currentQuestion.id, { media_key: null, media_alt: null });
    });
    toast.success("Image removed");
  }

  async function handleOptionImageUpload(optionId: string, file: File) {
    if (!currentQuestion || optionId.startsWith("temp-")) {
      if (optionId.startsWith("temp-")) toast.error("Save the option text first, then add an image");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("quizId", quiz.id);
      formData.append("questionId", currentQuestion.id);
      const uploadRes = await fetch("/api/internal/uploads", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        toast.error(err.error || "Upload failed");
        return;
      }
      const { key } = await uploadRes.json();

      const updatedOptions = currentQuestion.question_options.map((o) =>
        o.id === optionId ? { ...o, media_key: key, media_alt: file.name } : o
      );
      const updated = { ...currentQuestion, question_options: updatedOptions };
      setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));

      startTransition(async () => {
        await updateOption(quiz.id, optionId, { media_key: key, media_alt: file.name });
      });

      toast.success("Image uploaded");
      setOptionImageTarget(null);
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleOptionImageRemove(optionId: string) {
    if (!currentQuestion) return;
    const updatedOptions = currentQuestion.question_options.map((o) =>
      o.id === optionId ? { ...o, media_key: null, media_alt: null } : o
    );
    const updated = { ...currentQuestion, question_options: updatedOptions };
    setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));

    startTransition(async () => {
      await updateOption(quiz.id, optionId, { media_key: null, media_alt: null });
    });
    toast.success("Image removed");
  }

  function handleDeleteOption(optionId: string) {
    if (!currentQuestion) return;
    const questionId = currentQuestion.id;
    const removed = currentQuestion.question_options.find((o) => o.id === optionId);

    // Optimistic remove
    setQuestions((qs) =>
      qs.map((q) =>
        q.id === questionId
          ? {
              ...q,
              question_options: q.question_options.filter(
                (o) => o.id !== optionId
              ),
            }
          : q
      )
    );

    // Option not yet persisted — nothing to delete server-side
    if (optionId.startsWith("temp-")) return;

    startTransition(async () => {
      const result = await deleteOption(quiz.id, optionId);
      if (result.error) {
        toast.error(result.error);
        // Rollback
        if (removed) {
          setQuestions((qs) =>
            qs.map((q) =>
              q.id === questionId
                ? {
                    ...q,
                    question_options: [...q.question_options, removed].sort(
                      (a, b) => a.position - b.position
                    ),
                  }
                : q
            )
          );
        }
      }
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/quizzes" className="text-sm text-muted-foreground hover:text-foreground">
            ← Quizzes
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <h1 className="text-sm font-medium">{quiz.title}</h1>
          <Badge variant="outline">v{version.version}</Badge>
          <Badge variant={version.status === "draft" ? "secondary" : "default"}>
            {version.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isPending && <span className="text-xs text-muted-foreground">Saving...</span>}
          <AIGenerateModal onGenerated={handleAIGenerated} />
          <Link href={`/admin/quizzes/${quiz.id}/preview`}>
            <Button variant="outline" size="sm">Preview</Button>
          </Link>
        </div>
      </div>

      {/* Three-pane layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Question list */}
        <div className="flex w-64 flex-col border-r border-border bg-muted/30">
          <div className="flex items-center justify-between p-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Questions ({questions.length})
            </span>
          </div>
          <div className="flex-1 overflow-auto px-2 pb-2">
            {questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setSelectedIndex(i)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                  i === selectedIndex
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  Q{i + 1}. {(q.stem as { text?: string })?.text || `(${q.kind})`}
                </span>
              </button>
            ))}
          </div>
          <Separator />
          <div className="p-3">
            <Select onValueChange={(v) => handleAddQuestion(v as "mcq_single" | "mcq_multi" | "true_false" | "numeric")}>
              <SelectTrigger className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Add question" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mcq_single">Multiple Choice (Single)</SelectItem>
                <SelectItem value="mcq_multi">Multiple Choice (Multi)</SelectItem>
                <SelectItem value="true_false">True / False</SelectItem>
                <SelectItem value="numeric">Numeric</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Center: Editor */}
        <div className="flex-1 overflow-auto p-6">
          {currentQuestion ? (
            <div className="mx-auto max-w-2xl space-y-6">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="stem">Question Stem</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground mr-1">Use $...$ for math</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => openMathEditor({ type: "stem" })}
                      title="Math editor"
                    >
                      <Sigma className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => setPreviewStem(!previewStem)}
                      title={previewStem ? "Edit" : "Preview"}
                    >
                      {previewStem ? <Code className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                {previewStem ? (
                  <div className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <KaTeXRenderer text={(currentQuestion.stem as { text?: string })?.text || ""} />
                  </div>
                ) : (
                  <textarea
                    ref={stemRef}
                    id="stem"
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={(currentQuestion.stem as { text?: string })?.text || ""}
                    onChange={(e) => handleStemChange(e.target.value)}
                    placeholder="Enter your question here... Use $x^2$ for inline math or $$\\frac{a}{b}$$ for block math"
                  />
                )}
              </div>

              {/* Image attachment */}
              <div
                className="space-y-2"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {currentQuestion.media_key ? (
                  <div className="relative inline-block">
                    <img
                      src={`https://${process.env.NEXT_PUBLIC_R2_PUBLIC_HOST}/${currentQuestion.media_key}`}
                      alt={currentQuestion.media_alt || ""}
                      className={`max-h-48 rounded-lg border object-contain transition ${
                        dragOver ? "border-primary ring-2 ring-primary/30" : "border-border"
                      }`}
                    />
                    <button
                      onClick={handleRemoveImage}
                      className="absolute -right-2 -top-2 rounded-full border border-border bg-background p-1 shadow-sm hover:bg-destructive hover:text-destructive-foreground transition"
                      title="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {dragOver && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-primary/20 text-xs font-medium text-primary">
                        Drop to replace
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-sm transition ${
                        dragOver
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted-foreground/25 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
                      }`}
                    >
                      <ImagePlus className="h-6 w-6" />
                      <span className="font-medium">
                        {uploading
                          ? "Uploading..."
                          : dragOver
                          ? "Drop image here"
                          : "Add image"}
                      </span>
                      {!uploading && !dragOver && (
                        <span className="text-xs text-muted-foreground">
                          Drag &amp; drop, paste from clipboard, or click to browse
                        </span>
                      )}
                    </button>
                  </>
                )}
              </div>

              {/* Options (for MCQ Single, MCQ Multi, True-False) */}
              {(currentQuestion.kind === "mcq_single" || currentQuestion.kind === "mcq_multi" || currentQuestion.kind === "true_false") && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>
                      Options
                      {currentQuestion.kind === "mcq_multi" && (
                        <span className="ml-2 text-xs text-muted-foreground font-normal">(select all correct)</span>
                      )}
                    </Label>
                    {(currentQuestion.kind === "mcq_single" || currentQuestion.kind === "mcq_multi") && (
                      <Button variant="ghost" size="sm" onClick={handleAddOption}>
                        <Plus className="mr-1 h-3 w-3" /> Add option
                      </Button>
                    )}
                  </div>
                  {currentQuestion.question_options
                    .sort((a, b) => a.position - b.position)
                    .map((opt, optIdx) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSetCorrect(opt.id)}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center ${
                            currentQuestion.kind === "mcq_multi" ? "rounded-md" : "rounded-full"
                          } border-2 transition ${
                            opt.is_correct
                              ? "border-green-500 bg-green-500 text-white"
                              : "border-muted-foreground/30 hover:border-green-500/50"
                          }`}
                          title={currentQuestion.kind === "mcq_multi" ? "Toggle correct" : "Mark as correct"}
                        >
                          {opt.is_correct && <Check className="h-3 w-3" />}
                        </button>
                        <span className="text-sm font-medium text-muted-foreground w-5">
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <div className="flex-1 flex items-center gap-1">
                          {previewOptions[opt.id] ? (
                            <div className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm min-h-[36px] flex items-center gap-2">
                              {opt.media_key && (
                                <img
                                  src={`https://${process.env.NEXT_PUBLIC_R2_PUBLIC_HOST}/${opt.media_key}`}
                                  alt={opt.media_alt || ""}
                                  className="h-7 w-7 shrink-0 rounded object-contain"
                                />
                              )}
                              <KaTeXRenderer text={(opt.label as { text?: string })?.text || ""} />
                            </div>
                          ) : (
                            <div className="relative flex flex-1 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                              {opt.media_key && (
                                <span className="relative ml-1.5 shrink-0">
                                  <img
                                    src={`https://${process.env.NEXT_PUBLIC_R2_PUBLIC_HOST}/${opt.media_key}`}
                                    alt={opt.media_alt || ""}
                                    className="h-7 w-7 rounded object-contain"
                                  />
                                  <button
                                    onClick={() => handleOptionImageRemove(opt.id)}
                                    className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background p-px shadow-sm hover:bg-destructive hover:text-destructive-foreground transition"
                                    title="Remove image"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              )}
                              <Input
                                ref={(el) => {
                                  optionInputRefs.current[opt.id] = el;
                                }}
                                value={(opt.label as { text?: string })?.text || ""}
                                onChange={(e) => handleOptionLabelChange(opt.id, e.target.value)}
                                placeholder={`Option ${String.fromCharCode(65 + optIdx)} — use $...$ for math (optional if image)`}
                                className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
                              />
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 shrink-0"
                            onClick={() => openMathEditor({ type: "option", optionId: opt.id })}
                            title="Math editor"
                          >
                            <Sigma className="h-3 w-3 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 shrink-0"
                            onClick={() => setPreviewOptions((p) => ({ ...p, [opt.id]: !p[opt.id] }))}
                            title={previewOptions[opt.id] ? "Edit" : "Preview"}
                          >
                            {previewOptions[opt.id] ? <Code className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 shrink-0"
                            onClick={() => setOptionImageTarget({ optionId: opt.id, letter: String.fromCharCode(65 + optIdx) })}
                            title={opt.media_key ? "Replace image" : "Add image"}
                          >
                            <ImagePlus className={cn("h-3 w-3", opt.media_key ? "text-primary" : "text-muted-foreground")} />
                          </Button>
                        </div>
                        {(currentQuestion.kind === "mcq_single" || currentQuestion.kind === "mcq_multi") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 shrink-0"
                            onClick={() => handleDeleteOption(opt.id)}
                          >
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                </div>
              )}

              {/* Numeric answer */}
              {currentQuestion.kind === "numeric" && (
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="numeric-answer">Correct Answer</Label>
                    <Input
                      id="numeric-answer"
                      type="number"
                      step="any"
                      value={currentQuestion.numeric_answer ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        const updated = { ...currentQuestion, numeric_answer: val };
                        setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));
                        debouncedSave(`num-${currentQuestion.id}`, () =>
                          updateQuestion(quiz.id, currentQuestion.id, { numeric_answer: val })
                        );
                      }}
                      placeholder="e.g. 42"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="tolerance">Tolerance (±)</Label>
                      <Input
                        id="tolerance"
                        type="number"
                        step="any"
                        min="0"
                        value={currentQuestion.numeric_tolerance}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = { ...currentQuestion, numeric_tolerance: val };
                          setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));
                          debouncedSave(`tol-${currentQuestion.id}`, () =>
                            updateQuestion(quiz.id, currentQuestion.id, { numeric_tolerance: val })
                          );
                        }}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="unit">Unit (optional)</Label>
                      <Input
                        id="unit"
                        value={currentQuestion.numeric_unit || ""}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          const updated = { ...currentQuestion, numeric_unit: val };
                          setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));
                          debouncedSave(`unit-${currentQuestion.id}`, () =>
                            updateQuestion(quiz.id, currentQuestion.id, { numeric_unit: val })
                          );
                        }}
                        placeholder="e.g. cm, kg"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>Add a question to get started</p>
            </div>
          )}
        </div>

        {/* Right: Inspector */}
        <div className="w-64 border-l border-border p-4">
          {currentQuestion && (
            <div className="space-y-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Properties
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Type</Label>
                    <Badge variant="outline" className="w-fit">
                      {currentQuestion.kind === "mcq_single" && "MCQ (Single)"}
                      {currentQuestion.kind === "mcq_multi" && "MCQ (Multi)"}
                      {currentQuestion.kind === "true_false" && "True / False"}
                      {currentQuestion.kind === "numeric" && "Numeric"}
                    </Badge>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="points" className="text-xs">Points</Label>
                    <Input
                      id="points"
                      type="number"
                      min={0}
                      value={currentQuestion.points}
                      onChange={(e) => handlePointsChange(parseInt(e.target.value) || 0)}
                      className="h-8"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="time" className="text-xs">Time limit (seconds)</Label>
                    <Input
                      id="time"
                      type="number"
                      min={0}
                      value={currentQuestion.time_seconds ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value) : null;
                        const updated = { ...currentQuestion, time_seconds: val };
                        setQuestions(questions.map((q, i) => (i === selectedIndex ? updated : q)));
                        debouncedSave(`time-${currentQuestion.id}`, () =>
                          updateQuestion(quiz.id, currentQuestion.id, { time_seconds: val })
                        );
                      }}
                      className="h-8"
                      placeholder="∞"
                    />
                  </div>
                </CardContent>
              </Card>

              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Delete question
              </Button>

              <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete question?</DialogTitle>
                    <DialogDescription>
                      This will permanently delete question {selectedIndex + 1}{" "}
                      and all its options. This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  {(currentQuestion.stem as { text?: string })?.text && (
                    <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground line-clamp-3">
                      {(currentQuestion.stem as { text?: string }).text}
                    </p>
                  )}
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setDeleteConfirmOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => handleDeleteQuestion(currentQuestion.id)}
                    >
                      {isPending ? "Deleting..." : "Delete question"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </div>

      {/* Math editor dialog */}
      <MathEditor
        open={mathTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMathTarget(null);
        }}
        title={mathTarget?.type === "stem" ? "Math — question stem" : "Math — option"}
        onApply={handleMathApply}
      />

      {/* Option image upload dialog */}
      <Dialog
        open={optionImageTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOptionImageTarget(null);
            setOptionImageDragOver(false);
          }
        }}
      >
        <DialogContent
          onPaste={(e) => {
            if (!optionImageTarget) return;
            const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
            let file =
              items
                .find((item) => item.kind === "file" && item.type.startsWith("image/"))
                ?.getAsFile() ?? null;
            if (!file && e.clipboardData?.files) {
              file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/")) ?? null;
            }
            if (file) {
              e.preventDefault();
              handleOptionImageUpload(optionImageTarget.optionId, file);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/30 text-xs font-medium">
                {optionImageTarget?.letter}
              </span>
              Option image
            </DialogTitle>
            {(() => {
              const opt = currentQuestion?.question_options.find((o) => o.id === optionImageTarget?.optionId);
              const text = (opt?.label as { text?: string })?.text;
              return text ? (
                <DialogDescription className="line-clamp-2">{text}</DialogDescription>
              ) : (
                <DialogDescription>Upload an image for this option.</DialogDescription>
              );
            })()}
          </DialogHeader>
          {(() => {
            const opt = currentQuestion?.question_options.find((o) => o.id === optionImageTarget?.optionId);
            return opt?.media_key ? (
              <div className="flex justify-center rounded-lg border border-border bg-muted/30 p-4">
                <img
                  src={`https://${process.env.NEXT_PUBLIC_R2_PUBLIC_HOST}/${opt.media_key}`}
                  alt={opt.media_alt || ""}
                  className="max-h-48 object-contain"
                />
              </div>
            ) : null;
          })()}
          <input
            ref={optionImageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && optionImageTarget) handleOptionImageUpload(optionImageTarget.optionId, file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => optionImageInputRef.current?.click()}
            disabled={uploading}
            onDragOver={(e) => {
              e.preventDefault();
              setOptionImageDragOver(true);
            }}
            onDragLeave={() => setOptionImageDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOptionImageDragOver(false);
              const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
              if (file && optionImageTarget) {
                handleOptionImageUpload(optionImageTarget.optionId, file);
              } else if (e.dataTransfer.files.length > 0) {
                toast.error("Only image files are supported");
              }
            }}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-sm transition ${
              optionImageDragOver
                ? "border-primary bg-primary/10 text-primary"
                : "border-muted-foreground/25 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
            }`}
          >
            <ImagePlus className="h-6 w-6" />
            <span className="font-medium">
              {uploading ? "Uploading..." : optionImageDragOver ? "Drop image here" : "Add image"}
            </span>
            {!uploading && !optionImageDragOver && (
              <span className="text-xs text-muted-foreground">
                Drag &amp; drop, paste from clipboard, or click to browse
              </span>
            )}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
