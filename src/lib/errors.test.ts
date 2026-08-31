import { describe, expect, it } from "vitest";
import { AppError, resolveError, toUserMessage } from "@/lib/errors";

describe("AppError", () => {
  it("carries a code and a safe Arabic message", () => {
    const err = new AppError("NOT_FOUND", "المنتج غير موجود");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.userMessage).toBe("المنتج غير موجود");
    expect(err.name).toBe("AppError");
  });
});

describe("resolveError", () => {
  it("keeps AppError code and message, passing the cause for logging", () => {
    const cause = new Error("original detail");
    const result = resolveError(new AppError("CONFLICT", "تعارض في البيانات", { cause }));
    expect(result.code).toBe("CONFLICT");
    expect(result.userMessage).toBe("تعارض في البيانات");
    expect(result.cause).toBe(cause);
  });

  it("masks unknown errors behind a generic Arabic message", () => {
    const result = resolveError(new Error("internal db host unreachable"));
    expect(result.code).toBe("INTERNAL");
    expect(result.userMessage).toBe(
      "حدث خطأ غير متوقع. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع الدعم الفني.",
    );
    expect(result.cause).toBeInstanceOf(Error);
  });

  it("preserves the technical cause for logging", () => {
    const raw = "socket timeout";
    const result = resolveError(raw);
    expect(result.cause).toBe(raw);
    expect(result.code).toBe("INTERNAL");
  });
});

describe("toUserMessage", () => {
  it("never leaks internal details to the user", () => {
    const message = toUserMessage(new Error("MongoServerError: auth failed"));
    expect(message).not.toContain("MongoServerError");
    expect(message).toContain("حدث خطأ غير متوقع");
  });
});
