"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SessionOption {
  id: string;
  title: string;
}

interface QuizOption {
  quizVersionId: string;
  label: string;
}

interface Props {
  sessions: SessionOption[];
  quizzes: QuizOption[];
}

export function ResultsFilter({ sessions, quizzes }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session") ?? "";
  const quizVersionId = searchParams.get("quiz") ?? "";

  function updateParams(next: { session?: string; quiz?: string }) {
    const params = new URLSearchParams();
    const s = next.session ?? sessionId;
    const q = next.quiz ?? quizVersionId;
    if (s) params.set("session", s);
    if (q) params.set("quiz", q);
    router.push(`/admin/results?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={sessionId}
        onValueChange={(v) => updateParams({ session: v ?? "", quiz: "" })}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select session" />
        </SelectTrigger>
        <SelectContent>
          {sessions.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={quizVersionId}
        onValueChange={(v) => updateParams({ quiz: v ?? "" })}
        disabled={!sessionId}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select quiz" />
        </SelectTrigger>
        <SelectContent>
          {quizzes.map((q) => (
            <SelectItem key={q.quizVersionId} value={q.quizVersionId}>
              {q.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
