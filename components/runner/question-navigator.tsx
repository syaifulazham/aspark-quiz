"use client";

import { cn } from "@/lib/utils";
import { type RunnerQuestion, type RunnerAnswer } from "./types";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface QuestionNavigatorProps {
  questions: RunnerQuestion[];
  currentIndex: number;
  answers: Map<string, RunnerAnswer>;
  onNavigate: (index: number) => void;
  showCorrect?: boolean;
}

export function QuestionNavigator({
  questions,
  currentIndex,
  answers,
  onNavigate,
  showCorrect = false,
}: QuestionNavigatorProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={currentIndex === 0}
        onClick={() => onNavigate(currentIndex - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex flex-wrap gap-1">
        {questions.map((q, i) => {
          const answer = answers.get(q.id);
          const isAnswered = answer?.selectedOptionId || answer?.numericResponse !== undefined;
          const isCurrent = i === currentIndex;

          let dotClass = "border-border bg-background";
          if (isCurrent) dotClass = "border-primary bg-primary text-primary-foreground";
          else if (showCorrect && isAnswered) {
            const isCorrect = checkCorrect(q, answer);
            dotClass = isCorrect
              ? "border-green-500 bg-green-500 text-white"
              : "border-red-500 bg-red-500 text-white";
          } else if (isAnswered) {
            dotClass = "border-primary/50 bg-primary/10";
          }

          return (
            <button
              key={q.id}
              onClick={() => onNavigate(i)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded border text-xs font-medium transition",
                dotClass
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        disabled={currentIndex === questions.length - 1}
        onClick={() => onNavigate(currentIndex + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function checkCorrect(question: RunnerQuestion, answer?: RunnerAnswer): boolean {
  if (!answer) return false;
  if (question.kind === "mcq_single" || question.kind === "true_false") {
    const correct = question.options.find((o) => o.is_correct);
    return answer.selectedOptionId === correct?.id;
  }
  if (question.kind === "numeric" && question.numeric_answer !== null && answer.numericResponse !== undefined) {
    return Math.abs(answer.numericResponse - question.numeric_answer) <= question.numeric_tolerance;
  }
  return false;
}
