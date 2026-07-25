import { z } from "zod";

export const participantSchema = z.object({
  personal_id: z.string().min(1).max(64),
  full_name: z.string().min(1).max(160),
  nationality: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .optional()
    .nullable(),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  age: z.number().int().min(3).max(120).optional().nullable(),
  gender: z
    .enum(["male", "female", "other", "undisclosed"])
    .optional()
    .nullable(),
  school: z.string().max(200).optional().nullable(),
  agency: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  external_ref: z.string().max(128).optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type ParticipantInput = z.infer<typeof participantSchema>;

export const participantBatchSchema = z.object({
  participants: z.array(participantSchema).min(1).max(500),
  upsert: z.boolean().optional().default(false),
});
