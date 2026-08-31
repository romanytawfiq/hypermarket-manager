import { z } from "zod";

/**
 * Shared client/server validation for identity (user management) input.
 * Server Actions re-validate everything server-side; client use is UX only.
 */

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "اسم المستخدم يجب أن يكون ٣ أحرف على الأقل")
    .max(64, "اسم المستخدم طويل جدًا")
    .regex(/^[a-z0-9_.-]+$/, "اسم المستخدم يحتوي على رموز غير مسموح بها"),
  name: z.string().trim().min(1, "أدخل الاسم").max(120, "الاسم طويل جدًا"),
  password: z
    .string()
    .min(8, "كلمة المرور يجب أن تكون ٨ أحرف على الأقل")
    .max(128, "كلمة المرور طويلة جدًا"),
  /** Role document ObjectId string. Validated against the DB server-side. */
  roleId: z.string().min(1, "اختر الدور"),
  active: z.boolean().optional().default(true),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, "أدخل الاسم").max(120, "الاسم طويل جدًا").optional(),
    roleId: z.string().min(1, "اختر الدور").optional(),
    active: z.boolean().optional(),
    /** Optional new password (admin reset). */
    newPassword: z
      .string()
      .min(8, "كلمة المرور يجب أن تكون ٨ أحرف على الأقل")
      .max(128, "كلمة المرور طويلة جدًا")
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "لا توجد تغييرات لإرسالها",
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
