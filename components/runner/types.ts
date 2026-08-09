export interface RunnerQuestion {
  id: string;
  kind: "mcq_single" | "mcq_multi" | "true_false" | "numeric";
  content_kind: "text" | "image" | "text_image";
  stem: { text?: string };
  points: number;
  time_seconds: number | null;
  numeric_answer: number | null;
  numeric_tolerance: number;
  numeric_unit: string | null;
  explanation: { text?: string } | null;
  media_key: string | null;
  media_alt: string | null;
  position: number;
  options: RunnerOption[];
}

export interface RunnerOption {
  id: string;
  label: { text?: string };
  is_correct: boolean;
  position: number;
  media_key: string | null;
  media_alt: string | null;
}

export interface RunnerAnswer {
  questionId: string;
  selectedOptionId?: string;
  numericResponse?: number;
}

export interface RunnerState {
  currentIndex: number;
  answers: Map<string, RunnerAnswer>;
  startedAt: number;
  timeRemaining: number | null;
  isSubmitted: boolean;
}
