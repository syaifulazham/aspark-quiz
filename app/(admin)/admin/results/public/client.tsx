"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  ExternalLink,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Presentation,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createScoreboard,
  deleteScoreboard,
  setScoreboardActive,
  updateScoreboard,
  type ScoreboardPayload,
} from "@/lib/actions/scoreboard";
import { countryLabel } from "@/lib/country";
import { cn } from "@/lib/utils";

export interface BoardRow {
  id: string;
  competition_session_id: string;
  title: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  has_passcode: boolean;
  top_n: number;
  countries: string[];
  quiz_version_ids: string[];
  auto_refresh: boolean;
  opens_at: string | null;
  closes_at: string | null;
  updated_at: string;
}

export interface SessionOption {
  id: string;
  title: string;
  quizzes: Array<{ id: string; label: string }>;
}

interface Props {
  boards: BoardRow[];
  sessions: SessionOption[];
  countries: string[];
  origin: string;
  canManage: boolean;
}

interface FormState {
  title: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  sessionId: string;
  topN: string;
  countries: string[];
  allQuizzes: boolean;
  quizVersionIds: string[];
  autoRefresh: boolean;
  isActive: boolean;
  opensAt: string;
  closesAt: string;
  passcodeMode: "keep" | "set" | "remove" | "none";
  passcode: string;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

// <input type="datetime-local"> works in local time
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function statusOf(b: BoardRow, now = new Date()) {
  if (!b.is_active) return { label: "Off", tone: "muted" as const };
  if (b.opens_at && new Date(b.opens_at) > now) return { label: `Opens ${new Date(b.opens_at).toLocaleString()}`, tone: "info" as const };
  if (b.closes_at && new Date(b.closes_at) < now) return { label: "Closed", tone: "muted" as const };
  return { label: b.closes_at ? `Live until ${new Date(b.closes_at).toLocaleString()}` : "Live", tone: "live" as const };
}

const empty = (sessionId = ""): FormState => ({
  title: "",
  slug: "",
  slugTouched: false,
  description: "",
  sessionId,
  topN: "10",
  countries: [],
  allQuizzes: true,
  quizVersionIds: [],
  autoRefresh: true,
  isActive: true,
  opensAt: "",
  closesAt: "",
  passcodeMode: "none",
  passcode: "",
});

export function PublicScoreboardsClient({ boards, sessions, countries, origin, canManage }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BoardRow | null>(null);
  const [form, setForm] = useState<FormState>(empty());
  const [confirmDelete, setConfirmDelete] = useState<BoardRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const formSession = sessionById.get(form.sessionId);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function openCreate() {
    setEditing(null);
    setForm(empty(sessions[0]?.id ?? ""));
    setOpen(true);
  }

  function openEdit(b: BoardRow) {
    setEditing(b);
    setForm({
      title: b.title,
      slug: b.slug,
      slugTouched: true,
      description: b.description ?? "",
      sessionId: b.competition_session_id,
      topN: String(b.top_n),
      countries: b.countries,
      allQuizzes: b.quiz_version_ids.length === 0,
      quizVersionIds: b.quiz_version_ids,
      autoRefresh: b.auto_refresh,
      isActive: b.is_active,
      opensAt: toLocalInput(b.opens_at),
      closesAt: toLocalInput(b.closes_at),
      passcodeMode: b.has_passcode ? "keep" : "none",
      passcode: "",
    });
    setOpen(true);
  }

  function save() {
    const passcode: ScoreboardPayload["passcode"] =
      form.passcodeMode === "set"
        ? { mode: "set", value: form.passcode }
        : form.passcodeMode === "keep"
          ? { mode: "keep" }
          : { mode: "remove" };
    if (!form.allQuizzes && form.quizVersionIds.length === 0) {
      toast.error("Choose at least one quiz, or tick “All quizzes”.");
      return;
    }
    const payload: ScoreboardPayload = {
      title: form.title,
      slug: form.slug,
      description: form.description,
      competitionSessionId: form.sessionId,
      topN: Number(form.topN),
      countries: form.countries,
      quizVersionIds: form.allQuizzes ? [] : form.quizVersionIds,
      autoRefresh: form.autoRefresh,
      isActive: form.isActive,
      opensAt: fromLocalInput(form.opensAt),
      closesAt: fromLocalInput(form.closesAt),
      passcode,
    };
    startTransition(async () => {
      const res = editing ? await updateScoreboard(editing.id, payload) : await createScoreboard(payload);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(editing ? "Scoreboard updated" : "Scoreboard created");
      setOpen(false);
      router.refresh();
    });
  }

  function toggle(b: BoardRow, active: boolean) {
    startTransition(async () => {
      const res = await setScoreboardActive(b.id, active);
      if ("error" in res && res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  function remove(b: BoardRow) {
    startTransition(async () => {
      const res = await deleteScoreboard(b.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`“${b.title}” deleted`);
      setConfirmDelete(null);
      router.refresh();
    });
  }

  async function copy(url: string, id: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Public scoreboards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Shareable leaderboards for a competition session — open to anyone with the link, optionally protected by a passcode.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} disabled={sessions.length === 0}>
            <Plus /> New scoreboard
          </Button>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-card shadow-[var(--shadow-card)]">
        {boards.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-[var(--secondary)]">
              <Presentation className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No public scoreboards yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Create one for a session to share live top scorers on a screen, a website or with parents and schools.
            </p>
            {canManage && sessions.length > 0 && (
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus /> New scoreboard
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--secondary)]">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Scoreboard</th>
                <th className="px-4 py-2.5 font-medium">Session</th>
                <th className="px-4 py-2.5 font-medium">Shows</th>
                <th className="px-4 py-2.5 font-medium">Access</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {boards.map((b) => {
                const url = `${origin}/scoreboard/${b.slug}`;
                const session = sessionById.get(b.competition_session_id);
                const st = statusOf(b);
                return (
                  <tr key={b.id} className="align-top hover:bg-[var(--secondary)]/60">
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.title}</p>
                      <div className="mt-1 flex items-center gap-1">
                        <code className="max-w-64 truncate rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          /scoreboard/{b.slug}
                        </code>
                        <Button variant="ghost" size="icon-xs" onClick={() => copy(url, b.id)} aria-label="Copy link">
                          {copied === b.id ? <Check className="text-[var(--color-success-500)]" /> : <Copy />}
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{session?.title ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <p>Top {b.top_n} per quiz</p>
                      <p>
                        {b.quiz_version_ids.length ? `${b.quiz_version_ids.length} of ${session?.quizzes.length ?? "?"} quizzes` : "All quizzes"}
                        {" · "}
                        {b.countries.length ? b.countries.join(", ") : "All countries"}
                      </p>
                      {b.auto_refresh && (
                        <p className="mt-0.5 flex items-center gap-1">
                          <RefreshCw className="size-3" /> Live refresh
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          b.has_passcode
                            ? "bg-[oklch(0.96_0.06_85)] text-[oklch(0.45_0.11_70)]"
                            : "bg-[var(--secondary)] text-muted-foreground"
                        )}
                      >
                        {b.has_passcode ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
                        {b.has_passcode ? "Passcode" : "Open"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Switch checked={b.is_active} disabled={!canManage || isPending} onCheckedChange={(v) => toggle(b, v)} />
                        <span
                          className={cn(
                            "flex items-center gap-1.5 text-xs",
                            st.tone === "live" ? "text-[var(--color-success-500)]" : st.tone === "info" ? "text-[var(--color-info-500)]" : "text-muted-foreground"
                          )}
                        >
                          {st.tone === "live" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
                          {st.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" render={<a href={url} target="_blank" rel="noreferrer" />} aria-label="Open scoreboard">
                          <ExternalLink />
                        </Button>
                        {canManage && (
                          <>
                            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(b)} aria-label="Edit">
                              <Pencil />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(b)} aria-label="Delete">
                              <Trash2 className="text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / edit */}
      <Dialog open={open} onOpenChange={(o) => !isPending && setOpen(o)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit scoreboard" : "New public scoreboard"}</DialogTitle>
            <DialogDescription>Anyone with the link can view it{form.passcodeMode === "set" || form.passcodeMode === "keep" ? " after entering the passcode" : ""}.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sb-title">Title</Label>
                <Input
                  id="sb-title"
                  value={form.title}
                  placeholder="e.g. Bangladesh Round — Live Results"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value, slug: f.slugTouched ? f.slug : slugify(e.target.value) }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sb-slug">Public URL</Label>
                <div className="flex items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                  <span className="pl-2.5 text-xs text-muted-foreground">/scoreboard/</span>
                  <input
                    id="sb-slug"
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value), slugTouched: true }))}
                    className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
                    placeholder="bangladesh-round"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="sb-desc">Subtitle (optional)</Label>
              <Textarea id="sb-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Shown under the title" />
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div className="grid gap-1.5">
                <Label>Competition session</Label>
                <Select value={form.sessionId} onValueChange={(v) => setForm((f) => ({ ...f, sessionId: v ?? "", quizVersionIds: [], allQuizzes: true }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select session">
                      {(v: string | null) => sessionById.get(v ?? "")?.title ?? "Select session"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sb-topn">Top N per quiz</Label>
                <Input id="sb-topn" type="number" min={1} max={100} value={form.topN} onChange={(e) => set("topN", e.target.value)} />
              </div>
            </div>

            <fieldset className="grid gap-2 rounded-lg border border-[var(--border)] p-3">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium">Quizzes</legend>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="accent-[var(--primary)]" checked={form.allQuizzes} onChange={(e) => set("allQuizzes", e.target.checked)} />
                  All quizzes in the session
                </label>
              </div>
              {!form.allQuizzes && (
                <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                  {(formSession?.quizzes ?? []).map((q) => (
                    <label key={q.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[var(--secondary)]">
                      <input
                        type="checkbox"
                        className="accent-[var(--primary)]"
                        checked={form.quizVersionIds.includes(q.id)}
                        onChange={(e) =>
                          set("quizVersionIds", e.target.checked ? [...form.quizVersionIds, q.id] : form.quizVersionIds.filter((x) => x !== q.id))
                        }
                      />
                      <span className="truncate">{q.label}</span>
                    </label>
                  ))}
                  {formSession?.quizzes.length === 0 && <p className="text-xs text-muted-foreground">This session has no quizzes.</p>}
                </div>
              )}
            </fieldset>

            <fieldset className="grid gap-2 rounded-lg border border-[var(--border)] p-3">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium">Countries</legend>
                <span className="text-xs text-muted-foreground">{form.countries.length ? `${form.countries.length} selected` : "All countries"}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {countries.map((c) => {
                  const on = form.countries.includes(c);
                  return (
                    <button
                      type="button"
                      key={c}
                      onClick={() => set("countries", on ? form.countries.filter((x) => x !== c) : [...form.countries, c])}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                        on ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] text-muted-foreground hover:bg-[var(--secondary)]"
                      )}
                    >
                      {countryLabel(c)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="grid gap-3 rounded-lg border border-[var(--border)] p-3">
              <legend className="text-sm font-medium">Access</legend>
              <div className="flex flex-wrap gap-2">
                {(editing?.has_passcode
                  ? ([["keep", "Keep current passcode"], ["set", "Change passcode"], ["remove", "Remove passcode"]] as const)
                  : ([["none", "No passcode"], ["set", "Require passcode"]] as const)
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => set("passcodeMode", mode)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                      form.passcodeMode === mode ? "border-[var(--primary)] bg-[var(--color-brand-50)] font-medium text-foreground" : "border-[var(--border)] text-muted-foreground hover:bg-[var(--secondary)]"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {form.passcodeMode === "set" && (
                <Input
                  type="text"
                  autoComplete="off"
                  value={form.passcode}
                  onChange={(e) => set("passcode", e.target.value)}
                  placeholder="At least 4 characters"
                  className="max-w-xs font-mono"
                />
              )}
              {editing?.has_passcode && form.passcodeMode === "set" && (
                <p className="text-xs text-muted-foreground">Changing the passcode signs out everyone currently viewing the board.</p>
              )}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sb-open">Visible from (optional)</Label>
                <Input id="sb-open" type="datetime-local" value={form.opensAt} onChange={(e) => set("opensAt", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sb-close">Visible until (optional)</Label>
                <Input id="sb-close" type="datetime-local" value={form.closesAt} onChange={(e) => set("closesAt", e.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.autoRefresh} onCheckedChange={(v) => set("autoRefresh", v)} />
                Live refresh every 30s
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
                Published
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={isPending || !form.title || !form.slug || !form.sessionId}>
              {isPending ? "Saving…" : editing ? "Save changes" : "Create scoreboard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete scoreboard?</DialogTitle>
            <DialogDescription>
              “{confirmDelete?.title}” and its link /scoreboard/{confirmDelete?.slug} will stop working. Results are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={() => confirmDelete && remove(confirmDelete)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
