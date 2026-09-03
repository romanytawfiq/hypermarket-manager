import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Escapes a user-supplied string so it can be embedded in a RegExp literal
 * search without acting as regex syntax. Prevents accidental regex injection
 * and is shared by every free-text search (catalog, cashier, café, customers,
 * online store) instead of each service copy-pasting the same escape regex.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
