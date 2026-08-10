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
  schools: string[];
  grades: string[];
  countries: string[];
}

const ALL = "__all__";

export function ResultsFilter({ sessions, quizzes, schools, grades, countries }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session") ?? "";
  const quizVersionId = searchParams.get("quiz") ?? "";
  const school = searchParams.get("school") ?? "";
  const grade = searchParams.get("grade") ?? "";
  const country = searchParams.get("country") ?? "";

  function updateParams(next: {
    session?: string;
    quiz?: string;
    school?: string;
    grade?: string;
    country?: string;
  }) {
    const params = new URLSearchParams();
    const entries = {
      session: next.session ?? sessionId,
      quiz: next.quiz ?? quizVersionId,
      school: next.school ?? school,
      grade: next.grade ?? grade,
      country: next.country ?? country,
    };
    for (const [key, value] of Object.entries(entries)) {
      if (value) params.set(key, value);
    }
    router.push(`/admin/results?${params.toString()}`);
  }

  function renderConditionSelect(
    value: string,
    param: "school" | "grade" | "country",
    placeholder: string,
    options: string[]
  ) {
    if (options.length === 0) return null;
    return (
      <Select
        value={value || ALL}
        onValueChange={(v) =>
          updateParams({ [param]: !v || v === ALL ? "" : v })
        }
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder={placeholder}>
            {(v: string | null) => (!v || v === ALL ? `All ${placeholder.toLowerCase()}` : v)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All {placeholder.toLowerCase()}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={sessionId}
        onValueChange={(v) => updateParams({ session: v ?? "", quiz: "" })}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select session">
            {(v: string | null) => sessions.find((s) => s.id === v)?.title ?? "Select session"}
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

      <Select
        value={quizVersionId}
        onValueChange={(v) => updateParams({ quiz: v ?? "" })}
        disabled={!sessionId}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select quiz">
            {(v: string | null) => quizzes.find((q) => q.quizVersionId === v)?.label ?? "Select quiz"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {quizzes.map((q) => (
            <SelectItem key={q.quizVersionId} value={q.quizVersionId}>
              {q.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {renderConditionSelect(country, "country", "Countries", countries)}
      {renderConditionSelect(school, "school", "Schools", schools)}
      {renderConditionSelect(grade, "grade", "Grades", grades)}
    </div>
  );
}
