import { z } from "zod";

/**
 * Shared client/server validation for authentication input.
 *
 * Server Actions re-validate everything server-side; client use is UX only.
 */

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "أدخل اسم المستخدم")
    .max(64, "اسم المستخدم طويل جدًا"),
  password: z.string().min(1, "أدخل كلمة المرور").max(128, "كلمة المرور طويلة جدًا"),
});

export type LoginInput = z.infer<typeof loginSchema>;
