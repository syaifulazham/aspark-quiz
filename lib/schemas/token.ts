import { z } from "zod";

export const issueTokenSchema = z.object({
  participant_id: z.string().uuid().optional(),
  personal_id: z.string().min(1).max(64).optional(),
  quiz_id: z.string().uuid(),
  quiz_version: z
    .union([z.literal("latest_published"), z.number().int().positive()])
    .default("latest_published"),
  competition_session_id: z.string().uuid().optional().nullable(),
  mode: z.enum(["solo", "live"]).default("solo"),
  live_room_id: z.string().uuid().optional().nullable(),
  expires_in: z.number().int().min(60).max(2592000).default(86400),
  not_before: z.string().datetime().optional().nullable(),
  redirect_url: z.string().url().optional().nullable(),
  create_if_missing: z.boolean().optional().default(false),
});

export type IssueTokenInput = z.infer<typeof issueTokenSchema>;
