"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface QuestionData {
  id: string;
  kind: string;
  stem: string;
  points: number;
  time_seconds: number | null;
  media_key: string | null;
  media_alt: string | null;
  numeric_unit: string | null;
  options: Array<{ id: string; label: string; position: number }>;
}

interface SessionInfo {
  session_id: string;
  state: string;
  started_at: string | null;
  deadline_at: string | null;
  question_count: number;
  participant: { personal_id: string; full_name: string; school: string | null };
  quiz: {
    title: string;
    version: number;
    time_limit_seconds: number | null;
    max_attempts: number;
    passing_score: number | null;
    allow_backtrack: boolean;
    show_feedback: string;
  };
}

interface SessionState {
  phase: "loading" | "confirm" | "running" | "submitted";
  info: SessionInfo | null;
  deadlineAt: string | null;
  questionCount: number;
  currentIndex: number;
  question: QuestionData | null;
  currentAnswer: { selected_option_id: string | null; numeric_response: number | null } | null;
  answers: Map<number, string | number | null>;
  submittedData: Record<string, unknown> | null;
}

export default function QuizRunnerPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [state, setState] = useState<SessionState>({
    phase: "loading",
    info: null,
    deadlineAt: null,
    questionCount: 0,
    currentIndex: 0,
    question: null,
    currentAnswer: null,
    answers: new Map(),
    submittedData: null,
  });
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch session info on mount
  useEffect(() => {
    async function fetchInfo() {
      const res = await fetch(`/api/internal/sessions/${sessionId}/info`);
      if (res.ok) {
        const data: SessionInfo = await res.json();
        if (data.state === "active") {
          // Already started — go straight to running
          setState((prev) => ({
            ...prev,
            phase: "running",
            info: data,
            deadlineAt: data.deadline_at,
            questionCount: data.question_count,
          }));
          loadQuestion(0);
        } else if (data.state === "submitted") {
          setState((prev) => ({ ...prev, phase: "submitted", info: data }));
        } else {
          setState((prev) => ({ ...prev, phase: "confirm", info: data }));
        }
      }
    }
    fetchInfo();
  }, [sessionId]);

  // Start session
  const startSession = useCallback(async () => {
    const res = await fetch(`/api/internal/sessions/${sessionId}/start`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setState((prev) => ({
        ...prev,
        phase: "running",
        deadlineAt: data.deadline_at,
        questionCount: data.question_count,
      }));
      loadQuestion(0);
    }
  }, [sessionId]);

  // Load question
  const loadQuestion = useCallback(async (index: number) => {
    setLoading(true);
    const res = await fetch(`/api/internal/sessions/${sessionId}/questions/${index}`);
    if (res.ok) {
      const data = await res.json();
      setState((prev) => ({
        ...prev,
        currentIndex: index,
        question: data.question,
        currentAnswer: data.current_answer,
        deadlineAt: data.deadline_at,
        questionCount: data.total,
      }));
    }
    setLoading(false);
  }, [sessionId]);

  // Save answer
  const saveAnswer = useCallback(async (questionId: string, optionId?: string, numericResponse?: number) => {
    setSaving(true);
    await fetch(`/api/internal/sessions/${sessionId}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: questionId,
        selected_option_id: optionId || null,
        numeric_response: numericResponse ?? null,
      }),
    });
    setSaving(false);
  }, [sessionId]);

  // Submit
  const submitSession = useCallback(async () => {
    const res = await fetch(`/api/internal/sessions/${sessionId}/submit`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setState((prev) => ({ ...prev, phase: "submitted", submittedData: data }));
    }
  }, [sessionId]);

  // Heartbeat (every 30s)
  useEffect(() => {
    if (state.phase === "running") {
      heartbeatRef.current = setInterval(async () => {
        await fetch(`/api/internal/sessions/${sessionId}/heartbeat`, { method: "POST" });
      }, 30000);
      return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
    }
  }, [state.phase, sessionId]);

  // Timer
  useEffect(() => {
    if (!state.deadlineAt) { setTimeLeft(null); return; }
    const update = () => {
      const remaining = Math.max(0, Math.floor((new Date(state.deadlineAt!).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) submitSession();
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [state.deadlineAt, submitSession]);

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Confirmation screen
  if (state.phase === "confirm" && state.info) {
    const { participant, quiz } = state.info;
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{quiz.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Separator />
            <div className="text-sm">
              <p className="font-medium">{participant.full_name} · {participant.personal_id}</p>
              {participant.school && <p className="text-muted-foreground">{participant.school}</p>}
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>{state.info.question_count} questions</div>
              <div>{quiz.time_limit_seconds ? `${Math.floor(quiz.time_limit_seconds / 60)} minutes` : "No time limit"}</div>
              {quiz.passing_score && <div>Pass mark {quiz.passing_score}%</div>}
              <div>{quiz.max_attempts} attempt{quiz.max_attempts > 1 ? "s" : ""}</div>
            </div>
            <Separator />
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Before you start</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>The timer starts the moment you press Begin and does not pause.</li>
                <li>Your answers save automatically as you go.</li>
                {quiz.allow_backtrack && <li>You may return to earlier questions.</li>}
                <li>Closing the tab is safe — reopen this link to resume.</li>
              </ul>
            </div>
            <div className="flex justify-center gap-3 pt-4">
              <Button variant="outline">Not me</Button>
              <Button onClick={startSession}>Begin quiz →</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Submitted view
  if (state.phase === "submitted" && state.submittedData) {
    const d = state.submittedData as { score?: { raw: number; max: number; percentage: number; passed: boolean | null; correct: number; incorrect: number; unanswered: number }; show_feedback?: string };
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Check className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold">Quiz Submitted</h1>
          {d.show_feedback !== "never" && d.score && (
            <div className="space-y-3 rounded-lg border border-border p-6">
              <p className="text-4xl font-bold">{d.score.percentage}%</p>
              <p className="text-sm text-muted-foreground">
                {d.score.raw} / {d.score.max} points
              </p>
              {d.score.passed !== null && (
                <Badge variant={d.score.passed ? "default" : "destructive"}>
                  {d.score.passed ? "Passed" : "Not Passed"}
                </Badge>
              )}
              <div className="flex justify-center gap-4 text-sm">
                <span className="text-green-600">✓ {d.score.correct}</span>
                <span className="text-red-600">✗ {d.score.incorrect}</span>
                <span className="text-muted-foreground">— {d.score.unanswered}</span>
              </div>
            </div>
          )}
          {d.show_feedback === "never" && (
            <p className="text-muted-foreground">Submitted. Your organiser will share results.</p>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (state.phase === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const q = state.question;
  if (!q) return null;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Progress bar + Timer */}
      <div className="border-b border-border bg-card">
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((state.currentIndex + 1) / state.questionCount) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm font-medium">
            {state.currentIndex + 1} / {state.questionCount}
          </span>
          {timeLeft !== null && (
            <span className={cn(
              "font-mono text-sm font-medium",
              timeLeft <= 60 ? "text-red-600" : timeLeft <= 300 ? "text-amber-600" : "text-muted-foreground"
            )}>
              ⏱ {formatTime(timeLeft)}
            </span>
          )}
          {saving && <span className="text-xs text-muted-foreground">Saving...</span>}
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Q{state.currentIndex + 1}</Badge>
            <span className="text-xs text-muted-foreground">{q.points} pts</span>
          </div>

          <div className="text-lg leading-relaxed">{q.stem}</div>

          {q.media_key && (
            <img
              src={`https://${process.env.NEXT_PUBLIC_R2_PUBLIC_HOST}/${q.media_key}`}
              alt={q.media_alt || ""}
              className="max-h-80 rounded-lg border border-border object-contain"
            />
          )}

          {/* MCQ Options */}
          {(q.kind === "mcq_single" || q.kind === "true_false") && (
            <div className="grid gap-2">
              {q.options.map((opt, idx) => {
                const isSelected = state.currentAnswer?.selected_option_id === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setState((prev) => ({
                        ...prev,
                        currentAnswer: { selected_option_id: opt.id, numeric_response: null },
                      }));
                      saveAnswer(q.id, opt.id);
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left text-sm transition",
                      isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    )}
                  >
                    <span className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                    )}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Numeric */}
          {q.kind === "numeric" && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                className="max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={state.currentAnswer?.numeric_response ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : null;
                  setState((prev) => ({
                    ...prev,
                    currentAnswer: { selected_option_id: null, numeric_response: val },
                  }));
                }}
                onBlur={() => {
                  if (state.currentAnswer?.numeric_response !== null) {
                    saveAnswer(q.id, undefined, state.currentAnswer?.numeric_response ?? undefined);
                  }
                }}
                placeholder="Your answer"
              />
              {q.numeric_unit && <span className="text-sm text-muted-foreground">{q.numeric_unit}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="border-t border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Button
            variant="ghost"
            disabled={state.currentIndex === 0}
            onClick={() => loadQuestion(state.currentIndex - 1)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
          </Button>

          {state.currentIndex === state.questionCount - 1 ? (
            <Button onClick={submitSession}>
              Submit Quiz
            </Button>
          ) : (
            <Button
              onClick={() => loadQuestion(state.currentIndex + 1)}
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
