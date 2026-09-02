import { describe, it, expect } from "vitest";
import {
  signRedirect,
  verifyRedirectQuery,
  verifyRedirectSignature,
  parseOrderedQuery,
  signWebhook,
  verifyWebhookSignature,
  webhookOrderReference,
  isKashierPaid,
  kashierConfig,
  isKashierConfigured,
} from "@/lib/kashier";

/**
 * Unit tests for the Kashier gateway client (Phase 9.2).
 *
 * These are pure tests: they verify the redirect/webhook signing and
 * verification contracts (order-sensitive, URL-encoded, HMAC-SHA256) with
 * explicit keys — no network calls, no env, no DB.
 */
describe("Phase 9.2 — Kashier gateway signatures", () => {
  const secretKey = "sec_test_1234567890abcdef";
  const webhookKey = "whk_1234567890abcdef";

  describe("redirect signature", () => {
    it("builds a query string whose signature verifies under the same params", () => {
      const entries: Array<[string, string]> = [
        ["merchantId", "MID-000-000"],
        ["orderId", "ON-20260902-0001"],
        ["paymentStatus", "PAID"],
        ["amount", "450"],
        ["currency", "EGP"],
      ];
      const sig = signRedirect(entries, secretKey);
      expect(sig).toBeTruthy();
      expect(verifyRedirectSignature(entries, sig, secretKey)).toBe(true);
    });

    it("rejects a signature computed with a different secret key", () => {
      const entries: Array<[string, string]> = [["paymentStatus", "PAID"]];
      const sig = signRedirect(entries, secretKey);
      expect(verifyRedirectSignature(entries, sig, "wrong_key")).toBe(false);
    });

    it("rejects a tampered value (order/amount changed after signing)", () => {
      const original: Array<[string, string]> = [
        ["orderId", "A"],
        ["paymentStatus", "PAID"],
        ["amount", "100"],
      ];
      const sig = signRedirect(original, secretKey);
      const tampered: Array<[string, string]> = [
        ["orderId", "B"],
        ["paymentStatus", "PAID"],
        ["amount", "100"],
      ];
      expect(verifyRedirectSignature(tampered, sig, secretKey)).toBe(false);
    });

    it("excludes signature and mode parameters from the signed string", () => {
      const entries: Array<[string, string]> = [
        ["merchantId", "MID"],
        ["paymentStatus", "SUCCESS"],
        ["mode", "test"],
        ["signature", "irrelevant"],
      ];
      const withMeta: Array<[string, string]> = [
        ["merchantId", "MID"],
        ["paymentStatus", "SUCCESS"],
      ];
      // The signature should match whether or not signature/mode are present.
      const sig = signRedirect(withMeta, secretKey);
      expect(verifyRedirectSignature(entries, sig, secretKey)).toBe(true);
    });

    it("parses a raw query string in received order and verifies end-to-end", () => {
      const entries: Array<[string, string]> = [
        ["merchantId", "MID-000-000"],
        ["orderId", "ON-X"],
        ["paymentStatus", "CAPTURED"],
      ];
      const sig = signRedirect(entries, secretKey);
      const query = `?merchantId=${encodeURIComponent("MID-000-000")}&orderId=${encodeURIComponent("ON-X")}&paymentStatus=CAPTURED&signature=${encodeURIComponent(sig)}`;
      const parsed = parseOrderedQuery(query);
      expect(parsed).toContainEqual(["paymentStatus", "CAPTURED"]);
      expect(verifyRedirectQuery(query, sig, secretKey)).toBe(true);
    });
  });

  describe("webhook signature", () => {
    const paidData = {
      signatureKeys: ["merchantOrderId", "orderId", "paymentStatus", "amount"],
      merchantOrderId: "ON-20260902-0001",
      orderId: "kash-123",
      paymentStatus: "PAID",
      amount: 450,
      currency: "EGP",
    };

    it("verifies a signature produced over the declared signatureKeys", () => {
      const sig = signWebhook(paidData, webhookKey);
      const payload = { data: { ...paidData, kashierSignature: sig } };
      expect(verifyWebhookSignature(payload, webhookKey)).toBe(true);
    });

    it("rejects a wrong signing key (chosen-plaintext attacker)", () => {
      const sig = signWebhook(paidData, webhookKey);
      const payload = { data: { ...paidData, kashierSignature: sig } };
      expect(verifyWebhookSignature(payload, "attacker_key")).toBe(false);
    });

    it("rejects a tampered amount that re-signed nothing", () => {
      const sig = signWebhook(paidData, webhookKey);
      const tampered = { ...paidData, amount: 999999 };
      const payload = { data: { ...tampered, kashierSignature: sig } };
      expect(verifyWebhookSignature(payload, webhookKey)).toBe(false);
    });

    it("honours the order of signatureKeys (reordering breaks the signature)", () => {
      const sig = signWebhook(paidData, webhookKey);
      const reordered = {
        ...paidData,
        signatureKeys: ["amount", "paymentStatus", "orderId", "merchantOrderId"],
      };
      const payload = { data: { ...reordered, kashierSignature: sig } };
      expect(verifyWebhookSignature(payload, webhookKey)).toBe(false);
    });

    it("falls back to the legacy `signature` field", () => {
      const sig = signWebhook(paidData, webhookKey);
      const payload = { data: { ...paidData, signature: sig } };
      expect(verifyWebhookSignature(payload, webhookKey)).toBe(true);
    });

    it("fails closed when no signature is present or no key provided", () => {
      expect(verifyWebhookSignature({ data: { paymentStatus: "PAID" } }, webhookKey)).toBe(false);
      expect(verifyWebhookSignature({ data: { ...paidData, kashierSignature: "x" } }, "")).toBe(false);
    });
  });

  describe("webhook helpers", () => {
    it("extracts the merchant order reference across field-name variants", () => {
      expect(
        webhookOrderReference({ data: { merchantOrderId: "ON-A" } }),
      ).toBe("ON-A");
      expect(
        webhookOrderReference({ data: { orderReference: "ON-B" } }),
      ).toBe("ON-B");
      expect(webhookOrderReference({ data: { orderId: "ON-C" } })).toBe("ON-C");
      expect(webhookOrderReference({ data: {} })).toBe("");
    });

    it("isKashierPaid returns true only for captured statuses", () => {
      expect(isKashierPaid({ data: { paymentStatus: "PAID" } })).toBe(true);
      expect(isKashierPaid({ data: { paymentStatus: "SUCCESS" } })).toBe(true);
      expect(isKashierPaid({ data: { paymentStatus: "CAPTURED" } })).toBe(true);
      expect(isKashierPaid({ data: { paymentStatus: "PENDING" } })).toBe(false);
      expect(isKashierPaid({ data: { paymentStatus: "FAILED" } })).toBe(false);
      expect(isKashierPaid({ data: { orderStatus: "SUCCESSFUL" } })).toBe(true);
    });
  });

  describe("config & secret handling (no hardcoded secrets)", () => {
    it("reads the secret key and api key from the environment, never a literal", () => {
      // vitest.config.mts provides KASHIER_SECRET_KEY="test-secret-key",
      // KASHIER_API_KEY="test-api-key", KASHIER_MERCHANT_ID="MID-test-000".
      const cfg = kashierConfig();
      expect(cfg.secretKey).toBe("test-secret-key");
      expect(cfg.apiKey).toBe("test-api-key");
      expect(cfg.merchantId).toBe("MID-test-000");
      // Regression guard: an earlier version hardcoded a long production-looking
      // secret key literal here. Config must be derived purely from env so no
      // credential is embedded in source.
      expect(cfg.secretKey).not.toMatch(/\$[0-9a-f]{40,}/i);
      expect(cfg.secretKey).not.toMatch(/8eb20a1b449fc9182701a7c09c575c0d/i);
    });

    it("isKashierConfigured is true when all three credentials are set", () => {
      expect(isKashierConfigured()).toBe(true);
    });
  });
});