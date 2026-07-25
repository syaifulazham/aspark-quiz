import { z } from "zod";

export const createQuizSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  description: z.string().max(2000).optional(),
});

export const updateQuizSchema = createQuizSchema.partial();

export const createVersionSchema = z.object({
  quiz_id: z.string().uuid(),
  time_limit_seconds: z.number().int().positive().optional(),
  per_question_seconds: z.number().int().positive().optional(),
  shuffle_questions: z.boolean().default(false),
  shuffle_options: z.boolean().default(true),
  allow_backtrack: z.boolean().default(true),
  show_feedback: z.enum(["never", "immediate", "after_submit"]).default("after_submit"),
  passing_score: z.number().min(0).optional(),
  max_attempts: z.number().int().min(1).default(1),
  negative_marking: z.number().min(0).default(0),
  speed_bonus_enabled: z.boolean().default(false),
  speed_bonus_max: z.number().int().min(0).default(0),
});

export const questionSchema = z.object({
  kind: z.enum(["mcq_single", "true_false", "numeric"]),
  content_kind: z.enum(["text", "image", "text_image"]).default("text"),
  stem: z.record(z.unknown()),
  points: z.number().min(0).default(1),
  time_seconds: z.number().int().positive().optional(),
  numeric_answer: z.number().optional(),
  numeric_tolerance: z.number().min(0).default(0),
  numeric_unit: z.string().max(20).optional(),
  explanation: z.record(z.unknown()).optional(),
});

export const questionOptionSchema = z.object({
  label: z.record(z.unknown()),
  is_correct: z.boolean().default(false),
});

export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type CreateVersionInput = z.infer<typeof createVersionSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
export type QuestionOptionInput = z.infer<typeof questionOptionSchema>;
