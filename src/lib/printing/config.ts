/**
 * Receipt / thermal printing configuration (Phase 8).
 *
 * Store identity printed at the top and bottom of every printable receipt.
 *
 * There is no database-backed settings model yet (see
 * docs/domain-model.md §19), so this module is the single source of truth for
 * the printed store identity. Keep hardcoded store strings out of the receipt
 * renderer — any change to the printed header/footer happens here only.
 */

export const RECEIPT_STORE_NAME = "نكسا ريتيل";

export const RECEIPT_STORE_TAGLINE = "سوبر ماركت وكافيه";

export const RECEIPT_FOOTER_TEXT = "شكرًا لزيارتكم";