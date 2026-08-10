"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  Pencil,
  CalendarDays,
  Users,
  BookOpen,
  X,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import {
  createCompetitionSession,
  updateCompetitionSession,
  deleteCompetitionSession,
  setSessionQuizSets,
  toggleCompetitionSession,
  updateQuizSetTimeLimit,
} from "@/lib/actions/competition-session";
import { toast } from "sonner";

// ─── Types ───

interface CompetitionSession {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  description: string | null;
  session_type: "public" | "live_tournament" | "online_competition";
  is_active: boolean;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
  updated_at: string;
}

interface QuizSetRow {
  id: string;
  competition_session_id: string;
  quiz_version_id: string;
  position: number;
  label: string | null;
  time_limit_seconds: number | null;
  quiz_version: {
    id: string;
    version: number;
    quiz: { id: string; title: string };
  };
}

interface QuizVersionOption {
  id: string;
  version: number;
  status: string;
  quiz: { id: string; title: string };
}

interface Props {
  sessions: CompetitionSession[];
  quizSets: QuizSetRow[];
  quizVersions: QuizVersionOption[];
  participantCounts: Record<string, number>;
  origin: string;
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  public: "Public",
  live_tournament: "Live Tournament",
  online_competition: "Online Competition",
};

const SESSION_TYPE_COLORS: Record<string, "default" | "secondary" | "outline"> = {
  public: "secondary",
  live_tournament: "default",
  online_competition: "outline",
};

// ─── Component ───

export function SessionsClient({
  sessions: initialSessions,
  quizSets: initialQuizSets,
  quizVersions,
  participantCounts,
  origin,
}: Props) {
  const [sessions, setSessions] = useState(initialSessions);
  const [quizSets, setQuizSets] = useState(initialQuizSets);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<CompetitionSession | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    description: "",
    session_type: "public" as "public" | "live_tournament" | "online_competition",
    opens_at: "",
    closes_at: "",
  });

  // Quiz sets for the current form
  const [formQuizSets, setFormQuizSets] = useState<
    Array<{ quiz_version_id: string; label: string; position: number }>
  >([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [timeLimitDrafts, setTimeLimitDrafts] = useState<Record<string, string>>({});

  function resetForm() {
    setFormData({
      title: "",
      slug: "",
      description: "",
      session_type: "public",
      opens_at: "",
      closes_at: "",
    });
    setFormQuizSets([]);
    setEditingSession(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(session: CompetitionSession) {
    setEditingSession(session);
    setFormData({
      title: session.title,
      slug: session.slug,
      description: session.description || "",
      session_type: session.session_type,
      opens_at: session.opens_at ? toLocalDatetime(session.opens_at) : "",
      closes_at: session.closes_at ? toLocalDatetime(session.closes_at) : "",
    });
    // Load existing quiz sets for this session
    const existing = quizSets
      .filter((qs) => qs.competition_session_id === session.id)
      .sort((a, b) => a.position - b.position)
      .map((qs) => ({
        quiz_version_id: qs.quiz_version_id,
        label: qs.label || "",
        position: qs.position,
      }));
    setFormQuizSets(existing);
    setDialogOpen(true);
  }

  function handleSlugify(title: string) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setFormData((prev) => ({ ...prev, title, slug }));
  }

  function addQuizSet() {
    setFormQuizSets((prev) => [
      ...prev,
      { quiz_version_id: "", label: "", position: prev.length },
    ]);
  }

  function removeQuizSet(index: number) {
    setFormQuizSets((prev) =>
      prev.filter((_, i) => i !== index).map((qs, i) => ({ ...qs, position: i }))
    );
  }

  function updateQuizSet(index: number, field: string, value: string) {
    setFormQuizSets((prev) =>
      prev.map((qs, i) => (i === index ? { ...qs, [field]: value } : qs))
    );
  }

  function handleSave() {
    if (!formData.title || !formData.slug) {
      toast.error("Title and slug are required");
      return;
    }

    startTransition(async () => {
      const payload = {
        title: formData.title,
        slug: formData.slug,
        description: formData.description || null,
        session_type: formData.session_type,
        opens_at: formData.opens_at ? new Date(formData.opens_at).toISOString() : null,
        closes_at: formData.closes_at ? new Date(formData.closes_at).toISOString() : null,
      };

      const validQuizSets = formQuizSets.filter((qs) => qs.quiz_version_id);

      if (editingSession) {
        const result = await updateCompetitionSession(editingSession.id, payload);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        // Save quiz sets
        const qsResult = await setSessionQuizSets(editingSession.id, validQuizSets);
        if (qsResult.error) {
          toast.error(qsResult.error);
          return;
        }
        setSessions(
          sessions.map((s) =>
            s.id === editingSession.id ? { ...s, ...payload } : s
          )
        );
        setDialogOpen(false);
        toast.success("Session updated");
      } else {
        const result = await createCompetitionSession(payload);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        if (result.id) {
          // Save quiz sets
          if (validQuizSets.length > 0) {
            await setSessionQuizSets(result.id, validQuizSets);
          }
          setSessions([
            {
              id: result.id,
              org_id: "",
              ...payload,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as CompetitionSession,
            ...sessions,
          ]);
          setDialogOpen(false);
          toast.success("Session created");
        }
      }
    });
  }

  function handleDelete(sessionId: string) {
    if (!confirm("Delete this session? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteCompetitionSession(sessionId);
      if (result.error) {
        toast.error(result.error);
      } else {
        setSessions(sessions.filter((s) => s.id !== sessionId));
        toast.success("Session deleted");
      }
    });
  }

  function handleToggle(sessionId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await toggleCompetitionSession(sessionId, isActive);
      if (result.error) {
        toast.error(result.error);
      } else {
        setSessions(
          sessions.map((s) =>
            s.id === sessionId ? { ...s, is_active: isActive } : s
          )
        );
      }
    });
  }

  function getSessionQuizSets(sessionId: string) {
    return quizSets
      .filter((qs) => qs.competition_session_id === sessionId)
      .sort((a, b) => a.position - b.position);
  }

  function getQuizEndpoint(sessionSlug: string, quizVersionId: string) {
    return `${origin}/quiz/${sessionSlug}/${quizVersionId}`;
  }

  async function copyEndpoint(quizSetId: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(quizSetId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }

  function handleTimeLimitBlur(quizSetId: string, minutesStr: string) {
    const qs = quizSets.find((q) => q.id === quizSetId);
    const currentMinutes = qs?.time_limit_seconds != null ? qs.time_limit_seconds / 60 : null;
    const trimmed = minutesStr.trim();
    const newMinutes = trimmed === "" ? null : Number(trimmed);

    if (newMinutes !== null && (!Number.isFinite(newMinutes) || newMinutes <= 0)) {
      toast.error("Time limit must be a positive number of minutes");
      setTimeLimitDrafts((prev) => {
        const next = { ...prev };
        delete next[quizSetId];
        return next;
      });
      return;
    }

    if (newMinutes === currentMinutes) {
      setTimeLimitDrafts((prev) => {
        const next = { ...prev };
        delete next[quizSetId];
        return next;
      });
      return;
    }

    const seconds = newMinutes === null ? null : Math.round(newMinutes * 60);

    // Optimistic update
    setQuizSets((prev) =>
      prev.map((q) =>
        q.id === quizSetId ? { ...q, time_limit_seconds: seconds } : q
      )
    );
    setTimeLimitDrafts((prev) => {
      const next = { ...prev };
      delete next[quizSetId];
      return next;
    });

    startTransition(async () => {
      const result = await updateQuizSetTimeLimit(quizSetId, seconds);
      if (result.error) {
        toast.error(result.error);
        // Revert
        setQuizSets((prev) =>
          prev.map((q) =>
            q.id === quizSetId
              ? { ...q, time_limit_seconds: qs?.time_limit_seconds ?? null }
              : q
          )
        );
      } else {
        toast.success("Time limit updated");
      }
    });
  }

  function getQuizVersionLabel(versionId: string) {
    const qv = quizVersions.find((v) => v.id === versionId);
    if (!qv) return versionId;
    return `${qv.quiz.title} (v${qv.version})`;
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString();
  }

  function getSessionStatus(session: CompetitionSession) {
    const now = new Date();
    if (!session.is_active) return { label: "Inactive", variant: "secondary" as const };
    if (session.closes_at && new Date(session.closes_at) < now) return { label: "Closed", variant: "secondary" as const };
    if (session.opens_at && new Date(session.opens_at) > now) return { label: "Scheduled", variant: "outline" as const };
    return { label: "Open", variant: "default" as const };
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Sessions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage competitions, tournaments, and public quiz sessions.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Session
        </Button>
      </div>

      {/* Sessions list */}
      <div className="mt-6 grid gap-4">
        {sessions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CalendarDays className="h-12 w-12 text-muted-foreground" />
              <p className="mt-3 text-muted-foreground">No sessions yet.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create your first session
              </Button>
            </CardContent>
          </Card>
        ) : (
          sessions.map((session) => {
            const sessionQS = getSessionQuizSets(session.id);
            const status = getSessionStatus(session);
            const pCount = participantCounts[session.id] || 0;

            return (
              <Card key={session.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">{session.title}</CardTitle>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <Badge variant={SESSION_TYPE_COLORS[session.session_type]}>
                        {SESSION_TYPE_LABELS[session.session_type]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={session.is_active}
                        onCheckedChange={(checked: boolean) =>
                          handleToggle(session.id, checked)
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(session)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(session.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(session.opens_at)} – {formatDate(session.closes_at)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {pCount} participants
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5" />
                      {sessionQS.length} quiz set{sessionQS.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {sessionQS.length > 0 && (
                    <div className="mt-3 rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8">#</TableHead>
                            <TableHead>Quiz</TableHead>
                            <TableHead>Endpoint</TableHead>
                            <TableHead className="w-36">Max Time (min)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sessionQS.map((qs, idx) => {
                            const endpoint = qs.quiz_version?.id
                              ? getQuizEndpoint(session.slug, qs.quiz_version.id)
                              : null;
                            const draft = timeLimitDrafts[qs.id];
                            const minutesValue =
                              draft !== undefined
                                ? draft
                                : qs.time_limit_seconds != null
                                ? String(qs.time_limit_seconds / 60)
                                : "";
                            return (
                              <TableRow key={qs.id}>
                                <TableCell className="text-muted-foreground">
                                  {idx + 1}
                                </TableCell>
                                <TableCell>
                                  <span className="font-medium">
                                    {qs.label || qs.quiz_version?.quiz?.title || "Quiz"}
                                  </span>
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {qs.quiz_version?.quiz?.title} · v
                                    {qs.quiz_version?.version}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {endpoint && (
                                    <div className="flex items-center gap-1">
                                      <a
                                        href={endpoint}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex max-w-64 items-center gap-1 truncate font-mono text-xs text-primary hover:underline"
                                        title={endpoint}
                                      >
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{endpoint}</span>
                                      </a>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 shrink-0 p-0"
                                        onClick={() => copyEndpoint(qs.id, endpoint)}
                                        title="Copy endpoint"
                                      >
                                        {copiedId === qs.id ? (
                                          <Check className="h-3 w-3 text-green-600" />
                                        ) : (
                                          <Copy className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    placeholder="No limit"
                                    className="h-8 w-24 text-xs"
                                    value={minutesValue}
                                    onChange={(e) =>
                                      setTimeLimitDrafts((prev) => ({
                                        ...prev,
                                        [qs.id]: e.target.value,
                                      }))
                                    }
                                    onBlur={(e) =>
                                      handleTimeLimitBlur(qs.id, e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {session.description && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {session.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSession ? "Edit Session" : "New Session"}
            </DialogTitle>
            <DialogDescription>
              {editingSession
                ? "Update session configuration."
                : "Set up a new competition or quiz session."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Title */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Session Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => handleSlugify(e.target.value)}
                placeholder="e.g. National Science Olympiad 2025"
              />
            </div>

            {/* Slug */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Slug (URL path)</Label>
              <Input
                value={formData.slug}
                onChange={(e) =>
                  setFormData({ ...formData, slug: e.target.value })
                }
                placeholder="national-science-olympiad-2025"
              />
            </div>

            {/* Description */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Brief session description"
              />
            </div>

            {/* Session Type */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Session Type</Label>
              <Select
                value={formData.session_type}
                onValueChange={(v: string | null) =>
                  v && setFormData({
                    ...formData,
                    session_type: v as "public" | "live_tournament" | "online_competition",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="live_tournament">Live Tournament</SelectItem>
                  <SelectItem value="online_competition">Online Competition</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Open / Close dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Opens At</Label>
                <Input
                  type="datetime-local"
                  value={formData.opens_at}
                  onChange={(e) =>
                    setFormData({ ...formData, opens_at: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Closes At</Label>
                <Input
                  type="datetime-local"
                  value={formData.closes_at}
                  onChange={(e) =>
                    setFormData({ ...formData, closes_at: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Quiz Sets */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Quiz Sets</Label>
                <Button type="button" variant="outline" size="sm" onClick={addQuizSet}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add Quiz
                </Button>
              </div>
              {formQuizSets.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No quiz sets assigned. Click &quot;Add Quiz&quot; to assign quizzes to this session.
                </p>
              )}
              {formQuizSets.map((qs, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-border p-2"
                >
                  <div className="flex-1">
                    <Select
                      value={qs.quiz_version_id || "none"}
                      onValueChange={(v: string | null) =>
                        updateQuizSet(index, "quiz_version_id", !v || v === "none" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select quiz version" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select quiz…</SelectItem>
                        {quizVersions.map((qv) => (
                          <SelectItem key={qv.id} value={qv.id}>
                            {qv.quiz.title} (v{qv.version}) – {qv.status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    className="h-8 w-28 text-xs"
                    placeholder="Label (e.g. Round 1)"
                    value={qs.label}
                    onChange={(e) => updateQuizSet(index, "label", e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => removeQuizSet(index)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending
                ? "Saving..."
                : editingSession
                ? "Update Session"
                : "Create Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helpers ───

function toLocalDatetime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
