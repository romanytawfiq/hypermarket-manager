import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Regression guard for the POS camera scanner.
 *
 * A recent change replaced the stable `decodeFromVideoDevice` camera
 * acquisition with `decodeFromConstraints` + bespoke width/height/facingMode
 * `ideal` constraints. That negotiated a high-resolution stream which could
 * stall video load and trip ZXing's `tryPlayVideoTimeout`, which disposes the
 * media stream — stopping the camera shortly after the preview appears.
 *
 * These tests are static (source-level) checks on the client scanner because
 * the actual camera cannot be exercised in the node test environment. They lock
 * the scanner to the proven-stable camera path while keeping the useful 1D-only
 * decoder configuration, so a re-introduction of the regression fails CI.
 */
const SCANNER_PATH = fileURLToPath(
  new URL("../components/pos/barcode-scanner.tsx", import.meta.url),
);
const source = readFileSync(SCANNER_PATH, "utf8");

function normalizeModule(text: string): string {
  // Strip comments so configuration checks are stable across wording changes.
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
}

const code = normalizeModule(source);

describe("POS camera scanner regression (camera lifecycle stability)", () => {
  it("acquires the camera through the stable `decodeFromVideoDevice` path", () => {
    // The original working scanner used ZXing's device-based acquisition, which
    // builds minimal, universally-supported constraints
    // (`{ facingMode: 'environment' }` / `{ deviceId: { exact } }`).
    expect(code).toContain("decodeFromVideoDevice");
  });

  it("does NOT use the unstable `decodeFromConstraints` high-res path", () => {
    // Switching to decodeFromConstraints with bespoke width/height/facingMode
    // ideal constraints caused the camera to stop shortly after the preview.
    expect(code).not.toContain("decodeFromConstraints");
  });

  it("does NOT request custom width/height resolution constraints", () => {
    expect(code).not.toContain("width: { ideal: 1280 }");
    expect(code).not.toContain("height: { ideal: 720 }");
  });

  it("keeps the 1D-focused reader for retail decoding", () => {
    expect(code).toContain("BrowserMultiFormatOneDReader");
  });

  it("keeps TRY_HARDER enabled for thin retail barcode detection", () => {
    expect(code).toContain("TRY_HARDER");
  });

  it("configures the retail 1D barcode formats (EAN/UPC/Code128/39/93/ITF)", () => {
    for (const fmt of [
      "EAN_13",
      "EAN_8",
      "UPC_A",
      "UPC_E",
      "CODE_128",
      "CODE_39",
      "CODE_93",
      "ITF",
    ]) {
      expect(code).toContain(`BarcodeFormat.${fmt}`);
    }
  });

  it("does not request QR decoding (kept 1D-only)", () => {
    expect(code).not.toContain("BarcodeFormat.QR_CODE");
  });
});
