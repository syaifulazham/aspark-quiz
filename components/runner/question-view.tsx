"use client";

import { type RunnerQuestion, type RunnerAnswer } from "./types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { KaTeXRenderer } from "@/components/katex-renderer";

interface QuestionViewProps {
  question: RunnerQuestion;
  answer?: RunnerAnswer;
  onAnswer: (answer: RunnerAnswer) => void;
  showCorrect?: boolean;
  disabled?: boolean;
  questionNumber: number;
}

export function QuestionView({
  question,
  answer,
  onAnswer,
  showCorrect = false,
  disabled = false,
  questionNumber,
}: QuestionViewProps) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* Question header */}
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="shrink-0">
          Q{questionNumber}
        </Badge>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{question.points} {question.points === 1 ? "pt" : "pts"}</span>
          {question.time_seconds && (
            <>
              <span>·</span>
              <span>{question.time_seconds}s</span>
            </>
          )}
        </div>
      </div>

      {/* Stem */}
      <div className="text-lg font-medium leading-relaxed">
        <KaTeXRenderer text={question.stem.text || "(No question text)"} />
      </div>

      {/* Media */}
      {question.media_key && (
        <div className="overflow-hidden rounded-lg border border-border">
          <img
            src={`https://${process.env.NEXT_PUBLIC_R2_PUBLIC_HOST}/${question.media_key}`}
            alt={question.media_alt || "Question image"}
            className="max-h-80 w-full object-contain"
          />
        </div>
      )}

      {/* Options (MCQ / True-False) */}
      {(question.kind === "mcq_single" || question.kind === "mcq_multi" || question.kind === "true_false") && (
        <OptionList
          question={question}
          answer={answer}
          onAnswer={onAnswer}
          showCorrect={showCorrect}
          disabled={disabled}
        />
      )}

      {/* Numeric input */}
      {question.kind === "numeric" && (
        <NumericInput
          question={question}
          answer={answer}
          onAnswer={onAnswer}
          showCorrect={showCorrect}
          disabled={disabled}
        />
      )}

      {/* Explanation (shown when revealing answers) */}
      {showCorrect && question.explanation?.text && (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Explanation
          </p>
          <p className="text-sm"><KaTeXRenderer text={question.explanation.text} /></p>
        </div>
      )}
    </div>
  );
}

function OptionList({
  question,
  answer,
  onAnswer,
  showCorrect,
  disabled,
}: {
  question: RunnerQuestion;
  answer?: RunnerAnswer;
  onAnswer: (answer: RunnerAnswer) => void;
  showCorrect: boolean;
  disabled: boolean;
}) {
  const sortedOptions = [...question.options].sort((a, b) => a.position - b.position);

  return (
    <div className="grid gap-2">
      {sortedOptions.map((option, idx) => {
        const isSelected = answer?.selectedOptionId === option.id;
        const isCorrect = option.is_correct;
        const letter = String.fromCharCode(65 + idx);

        let stateClass = "";
        if (showCorrect) {
          if (isCorrect) stateClass = "border-green-500 bg-green-50 dark:bg-green-500/10";
          else if (isSelected && !isCorrect) stateClass = "border-red-500 bg-red-50 dark:bg-red-500/10";
        } else if (isSelected) {
          stateClass = "border-primary bg-primary/5";
        }

        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onAnswer({ questionId: question.id, selectedOptionId: option.id })}
            className={cn(
              "flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left text-sm transition",
              "hover:border-primary/50",
              "disabled:cursor-not-allowed disabled:opacity-60",
              stateClass || "border-border"
            )}
          >
            <span className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
              isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
            )}>
              {showCorrect && isCorrect ? <Check className="h-3.5 w-3.5" /> : 
               showCorrect && isSelected && !isCorrect ? <X className="h-3.5 w-3.5" /> : 
               letter}
            </span>
            <span className="flex-1 space-y-2">
              {option.media_key && (
                <img
                  src={`https://${process.env.NEXT_PUBLIC_R2_PUBLIC_HOST}/${option.media_key}`}
                  alt={option.media_alt || `Option ${letter}`}
                  className="max-h-40 rounded-md border border-border object-contain"
                />
              )}
              {option.label?.text && (
                <span className="block"><KaTeXRenderer text={option.label.text} /></span>
              )}
              {!option.media_key && !option.label?.text && (
                <span className="block">{`Option ${letter}`}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NumericInput({
  question,
  answer,
  onAnswer,
  showCorrect,
  disabled,
}: {
  question: RunnerQuestion;
  answer?: RunnerAnswer;
  onAnswer: (answer: RunnerAnswer) => void;
  showCorrect: boolean;
  disabled: boolean;
}) {
  const isCorrect =
    showCorrect &&
    answer?.numericResponse !== undefined &&
    question.numeric_answer !== null &&
    Math.abs(answer.numericResponse - question.numeric_answer) <= question.numeric_tolerance;

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <Label htmlFor="numeric-response">Your answer</Label>
        <div className="flex items-center gap-2">
          <Input
            id="numeric-response"
            type="number"
            step="any"
            disabled={disabled}
            value={answer?.numericResponse ?? ""}
            onChange={(e) =>
              onAnswer({
                questionId: question.id,
                numericResponse: e.target.value ? parseFloat(e.target.value) : undefined,
              })
            }
            className={cn(
              "max-w-xs",
              showCorrect && isCorrect && "border-green-500",
              showCorrect && !isCorrect && answer?.numericResponse !== undefined && "border-red-500"
            )}
            placeholder="Enter a number"
          />
          {question.numeric_unit && (
            <span className="text-sm text-muted-foreground">{question.numeric_unit}</span>
          )}
        </div>
      </div>
      {showCorrect && (
        <p className="text-sm">
          <span className="font-medium">Correct answer: </span>
          {question.numeric_answer}
          {question.numeric_tolerance > 0 && ` (±${question.numeric_tolerance})`}
          {question.numeric_unit && ` ${question.numeric_unit}`}
        </p>
      )}
    </div>
  );
}
