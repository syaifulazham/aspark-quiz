"use client";

import { useState, useCallback } from "react";
import { QuestionView, QuestionNavigator } from "@/components/runner";
import type { RunnerQuestion, RunnerAnswer } from "@/components/runner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Monitor,
  Tablet,
  Smartphone,
  Eye,
  EyeOff,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS: Record<Device, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

interface Props {
  quiz: { id: string; title: string; slug: string };
  version: {
    id: string;
    version: number;
    status: string;
    time_limit_seconds: number | null;
    per_question_seconds: number | null;
    shuffle_questions: boolean;
    shuffle_options: boolean;
  };
  questions: RunnerQuestion[];
}

export function PreviewClient({ quiz, version, questions }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, RunnerAnswer>>(new Map());
  const [showCorrect, setShowCorrect] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");

  const currentQuestion = questions[currentIndex];

  const handleAnswer = useCallback(
    (answer: RunnerAnswer) => {
      setAnswers((prev) => {
        const next = new Map(prev);
        next.set(answer.questionId, answer);
        return next;
      });
    },
    []
  );

  const handleReset = () => {
    setAnswers(new Map());
    setCurrentIndex(0);
    setShowCorrect(false);
  };

  if (questions.length === 0) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No questions to preview</p>
        <Link href={`/admin/quizzes/${quiz.id}/edit`}>
          <Button variant="outline">Go to editor</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 left-64 flex flex-col z-10 bg-background">
      {/* Control bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/quizzes/${quiz.id}/edit`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Editor
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm font-medium">{quiz.title}</span>
          <Badge variant="outline">Preview v{version.version}</Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Device selector */}
          <div className="flex items-center rounded-md border border-border">
            <button
              onClick={() => setDevice("desktop")}
              className={`p-1.5 ${device === "desktop" ? "bg-muted" : ""}`}
              title="Desktop"
            >
              <Monitor className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDevice("tablet")}
              className={`p-1.5 ${device === "tablet" ? "bg-muted" : ""}`}
              title="Tablet"
            >
              <Tablet className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDevice("mobile")}
              className={`p-1.5 ${device === "mobile" ? "bg-muted" : ""}`}
              title="Mobile"
            >
              <Smartphone className="h-4 w-4" />
            </button>
          </div>

          <Separator orientation="vertical" className="h-5" />

          {/* Jump to question */}
          <Select
            value={String(currentIndex)}
            onValueChange={(v) => v && setCurrentIndex(parseInt(v))}
          >
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {questions.map((_, i) => (
                <SelectItem key={i} value={String(i)}>
                  Question {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Separator orientation="vertical" className="h-5" />

          {/* Reveal answers */}
          <Button
            variant={showCorrect ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowCorrect(!showCorrect)}
          >
            {showCorrect ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
            {showCorrect ? "Hide" : "Reveal"}
          </Button>

          {/* Reset */}
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>

      {/* Preview viewport */}
      <div className="flex flex-1 items-start justify-center overflow-auto bg-muted/30 p-6 pb-20">
        <div
          className="rounded-lg border border-border bg-background shadow-lg"
          style={{
            width: DEVICE_WIDTHS[device],
            maxWidth: "100%",
          }}
        >
          {/* Runner content */}
          <div className="p-6 md:p-8">
            {currentQuestion && (
              <QuestionView
                question={currentQuestion}
                answer={answers.get(currentQuestion.id)}
                onAnswer={handleAnswer}
                showCorrect={showCorrect}
                questionNumber={currentIndex + 1}
              />
            )}
          </div>
        </div>
      </div>

      {/* Bottom navbar - Navigator */}
      <div className="sticky bottom-0 flex items-center justify-center border-t border-border bg-card px-4 py-3">
        <QuestionNavigator
          questions={questions}
          currentIndex={currentIndex}
          answers={answers}
          onNavigate={setCurrentIndex}
          showCorrect={showCorrect}
        />
      </div>
    </div>
  );
}
