/**
 * Shared server-side error handling.
 *
 * Transforms errors thrown by services/actions into two forms:
 *  - a safe, user-facing Arabic message for the UI
 *  - technical context for server logs
 *
 * Rules:
 *  - Never expose internal error details to the user.
 *  - Domain/validation errors carry a safe message; everything else resolves to
 *    a generic Arabic message while the original cause is preserved for logs.
 */

export type AppErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Safe Arabic message intended for the end user. */
  readonly userMessage: string;

  constructor(code: AppErrorCode, userMessage: string, options?: ErrorOptions) {
    super(userMessage, options);
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

export interface ResolvedError {
  code: AppErrorCode;
  userMessage: string;
  /** Technical detail for logging; never shown to the user. */
  cause: unknown;
}

/** A generic, safe Arabic message used when an error is not domain-specific. */
const GENERIC_USER_MESSAGE =
  "حدث خطأ غير متوقع. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع الدعم الفني.";

function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Normalizes any thrown value into a structured result with a safe Arabic
 * user message plus the original cause for logging.
 */
export function resolveError(error: unknown): ResolvedError {
  if (isAppError(error)) {
    return {
      code: error.code,
      userMessage: error.userMessage,
      cause: error.cause ?? error,
    };
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL",
      userMessage: GENERIC_USER_MESSAGE,
      cause: error,
    };
  }

  return {
    code: "INTERNAL",
    userMessage: GENERIC_USER_MESSAGE,
    cause: error,
  };
}

/**
 * Returns a user-facing Arabic message for an unknown error. Intended for
 * server actions that must not leak internal details to the client.
 */
export function toUserMessage(error: unknown): string {
  return resolveError(error).userMessage;
}
