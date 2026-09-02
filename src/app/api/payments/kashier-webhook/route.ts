import { NextRequest } from "next/server";
import {
  verifyWebhookSignature,
  webhookOrderReference,
  isKashierPaid,
  kashierConfig,
  type KashierWebhookPayload,
} from "@/lib/kashier";
import { markOnlineOrderPaid } from "@/services/online-store.service";
import { resolveError } from "@/lib/errors";

/**
 * Kashier server webhook (Phase 9.2).
 *
 * This is the AUTHORITATIVE confirmation of an online payment. The merchant
 * redirect is cosmetic only; a payment is never considered captured until this
 * endpooint receives a signature-verified Kashier notification. No fabricated
 * payment success is ever recorded.
 *
 * Security: every webhook is verified (HMAC-SHA256 over the payload's declared
 * `signatureKeys`) against the configured signing key. Verification is
 * fail-closed — an unverifiable webhook is rejected and never mutates state.
 *
 * Idempotency: `markOnlineOrderPaid` replays safely, so Kashier's retries are
 * harmless.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let payload: KashierWebhookPayload;
  try {
    payload = (await request.json()) as KashierWebhookPayload;
  } catch {
    // Malformed body — reject.
    return new Response("Bad payload", { status: 400 });
  }

  // Determine the signing key: prefer the dedicated webhook signing key, then
  // fall back to the payment API key (some dashboards sign with the API key).
  const cfg = kashierConfig();
  const signingKey = cfg.webhookSigningKey || cfg.apiKey;
  if (!signingKey) {
    return new Response("Gateway not configured", { status: 400 });
  }

  if (!verifyWebhookSignature(payload, signingKey)) {
    console.error(
      "[kashier-webhook] signature verification failed",
      JSON.stringify(payload),
    );
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    // Extract our order reference (the value we set as orderReference at session
    // creation).
    const orderNumber = webhookOrderReference(payload);

    if (isKashierPaid(payload) && orderNumber) {
      const amount = Number(payload.data?.amount ?? 0);
      const transactionId =
        typeof payload.data?.transactionId === "string"
          ? payload.data.transactionId
          : undefined;
      await markOnlineOrderPaid({
        orderNumber,
        amount,
        transactionId,
        status: String(payload.data?.paymentStatus ?? "PAID"),
      });
    }

    // Always acknowledge valid (verified) notifications so Kashier stops
    // retrying, regardless of whether the order was found.
    return new Response("OK", { status: 200 });
  } catch (error) {
    // Log technical context; keep the ack so Kashier does not retry forever for
    // a transient failure. We never leak internals to the caller.
    console.error("[kashier-webhook] processing failed", resolveError(error));
    return new Response("OK", { status: 200 });
  }
}
