"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatOneDReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import {
  AlertTriangleIcon,
  CameraIcon,
  CheckCircle2Icon,
  Loader2Icon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Outcome of the common barcode handler that the scanner reports back so it can
 * show the correct Arabic feedback. The scanner itself only produces a barcode
 * string — all product lookup / stock / cart logic lives in the POS common
 * handler (`handleBarcodeDetected`) so camera and USB/keyboard share one path.
 */
export type ScanOutcome =
  | { status: "added"; productName: string }
  | { status: "inactive" }
  | { status: "notfound" }
  | { status: "error" };

type ScanState =
  | "starting"
  | "scanning"
  | "processing"
  | "success"
  | "inactive"
  | "notfound"
  | "error";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetect: (barcode: string) => Promise<ScanOutcome>;
}

// Retail (supermarket) 1D formats. EAN/UPC and Code 128/39 make up the vast
// majority of POS product labels. QR is intentionally NOT included: it is not a
// product barcode and including it makes the decoder both slower and prone to
// pointless "no QR found" failures that spam the console (see below).
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
];

// Why a 1D-only reader:
//  * BrowserMultiFormatOneDReader decodes ONLY the 1D formats above, so there is
//    no QR/DataMatrix/PDF417 overhead and no QR partial-detection noise.
//  * It bypasses MultiFormatReader.decodeInternal, whose `console.warn` treats the
//    library's own NotFoundException (which extends Exception, not ReaderException)
//    as a "non-ReaderException" on every miss — the source of the console spam.
// TRY_HARDER: scans every row of the frame (not just ~25 in the center), which is
// required to reliably catch small, thin retail 1D barcodes in a noisy camera feed.
const hints = new Map<DecodeHintType, unknown>();
hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
hints.set(DecodeHintType.TRY_HARDER, true);

const RESET_AFTER_ADD_MS = 1400;
const RESCAN_COOLDOWN_MS = 1500;

export function BarcodeScanner({ open, onOpenChange, onDetect }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<ScanState>("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<{ title: string; sub?: string } | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  const readerRef = useRef<BrowserMultiFormatOneDReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectRef = useRef(onDetect);
  const processingRef = useRef(false);
  const lastBarcodeRef = useRef("");
  const cooldownRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest handler without restarting the decode loop.
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  function stopScanning() {
    try {
      controlsRef.current?.stop();
    } catch {
      /* noop */
    }
    controlsRef.current = null;
    const video = videoRef.current;
    if (video && video.srcObject instanceof MediaStream) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    BrowserMultiFormatOneDReader.releaseAllStreams();
  }

  function handleStartError(err: unknown) {
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      setStatus("error");
      setErrorMessage("لا يمكن الوصول إلى الكاميرا.");
      setResultMessage({
        title:
          "يرجى السماح للموقع باستخدام الكاميرا من إعدادات المتصفح، ثم المحاولة مرة أخرى.",
      });
      return;
    }
    if (err instanceof DOMException && err.name === "NotFoundError") {
      setStatus("error");
      setErrorMessage("لم يتم العثور على كاميرا متاحة على هذا الجهاز.");
      return;
    }
    if (err instanceof DOMException && err.name === "NotReadableError") {
      setStatus("error");
      setErrorMessage("الكاميرا قيد الاستخدام من تطبيق آخر.");
      return;
    }
    setStatus("error");
    setErrorMessage("تعذّر تشغيل الكاميرا.");
  }

  function handleOutcome(outcome: ScanOutcome) {
    switch (outcome.status) {
      case "added":
        setStatus("success");
        setResultMessage({ title: "تمت إضافة المنتج", sub: outcome.productName });
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
          setStatus("scanning");
          setResultMessage(null);
        }, RESET_AFTER_ADD_MS);
        break;
      case "inactive":
        setStatus("inactive");
        setResultMessage({ title: "هذا المنتج غير نشط ولا يمكن بيعه." });
        break;
      case "notfound":
        setStatus("notfound");
        setResultMessage({
          title: "لم يتم العثور على منتج بهذا الباركود.",
          sub: lastBarcodeRef.current,
        });
        break;
      case "error":
      default:
        setStatus("error");
        setErrorMessage("تعذّر إضافة المنتج. أعد المحاولة.");
    }
  }

  async function start(deviceId?: string) {
    setStatus("starting");
    setErrorMessage(null);
    setResultMessage(null);
    processingRef.current = false;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrorMessage("المسح بالكاميرا غير متاح على هذا الجهاز.");
      setResultMessage({ title: "يمكنك استخدام البحث أو قارئ الباركود التقليدي." });
      return;
    }

    // One reader instance, created once with fixed hints, reused across every
    // frame — never rebuilt per frame (see ZXing continuous-scan guidance).
    const reader = new BrowserMultiFormatOneDReader(hints);
    readerRef.current = reader;

    try {
      // Use ZXing's device-based acquisition (`decodeFromVideoDevice`). Its
      // constraints are the minimal, proven-stable set used by the original
      // working scanner: `{ facingMode: 'environment' }` when no device is
      // chosen, or `{ deviceId: { exact } }` once the user picks a camera.
      // Do NOT pass custom width/height or an `ideal` facingMode object here —
      // a negotiated high-res stream can stall video load and trip ZXing's
      // `tryPlayVideoTimeout`, which disposes the media stream and stops the
      // camera shortly after the preview appears.
      const controls = await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current ?? undefined,
        (result) => {
          // A `result === undefined` means "no barcode in this frame" — an
          // expected scanner miss. We ignore it silently; only a real decoded
          // barcode proceeds. Unexpected scanner errors surface through the
          // promise rejection in the try/catch below, not here.
          if (!result || processingRef.current) return;
          const text = result.getText();
          if (!text) return;

          const now = Date.now();
          if (text === lastBarcodeRef.current && now < cooldownRef.current) return;
          lastBarcodeRef.current = text;
          cooldownRef.current = now + RESCAN_COOLDOWN_MS;
          processingRef.current = true;
          setStatus("processing");
          setErrorMessage(null);
          setResultMessage(null);

          onDetectRef.current(text)
            .then(handleOutcome)
            .catch(() => {
              setStatus("error");
              setErrorMessage("تعذّر البحث عن المنتج. أعد المحاولة.");
            })
            .finally(() => {
              processingRef.current = false;
            });
        },
      );
      controlsRef.current = controls;
      setStatus("scanning");
    } catch (err) {
      handleStartError(err);
    }
  }

  async function listCameras() {
    try {
      const devices = await BrowserMultiFormatOneDReader.listVideoInputDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setCameras(videoDevices);
      if (videoDevices.length > 0) {
        const preferred =
          videoDevices.find((d) => /back|rear|environment/i.test(d.label)) ?? videoDevices[0];
        setActiveDeviceId(preferred?.deviceId ?? null);
      }
    } catch {
      setCameras([]);
    }
  }

  async function switchCamera(deviceId: string) {
    stopScanning();
    setActiveDeviceId(deviceId);
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    await start(deviceId);
  }

  function resetForRescan() {
    cooldownRef.current = 0;
    setStatus("scanning");
    setErrorMessage(null);
    setResultMessage(null);
    processingRef.current = false;
  }

  // On open, start the stream (requesting permission) then enumerate cameras.
  // The start call is deferred so state updates do not run synchronously inside
  // the effect body (see the React Compiler guidance used across this codebase).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      await start();
      if (cancelled) return;
      await listCameras();
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Stop the stream and release the camera when the dialog closes or unmounts.
  useEffect(() => {
    if (!open) {
      stopScanning();
      readerRef.current = null;
    }
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      stopScanning();
      readerRef.current = null;
    };
  }, [open]);

  const hasMultipleCameras = cameras.length > 1;

  return (
    <Dialog open={open} onOpenChange={(v) => onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CameraIcon className="size-4" aria-hidden />
            مسح الباركود
          </DialogTitle>
          <DialogDescription>استخدم كاميرا الجهاز لمسح باركود المنتج</DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-lg border bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-video w-full object-cover"
          />

          {(status === "scanning" || status === "starting") && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="relative h-1/2 w-3/4">
                <div className="absolute inset-0 rounded-lg border-2 border-white/70" />
                <div className="absolute start-0 top-0 h-1 w-full animate-pulse bg-white/70" />
              </div>
            </div>
          )}

          {status === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <p className="flex items-center gap-2 text-sm text-white">
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
                جاري تشغيل الكاميرا...
              </p>
            </div>
          )}
        </div>

        <div aria-live="polite" className="grid gap-3">
          {status === "scanning" && (
            <p className="text-center text-sm text-muted-foreground">
              وجّه الكاميرا نحو الباركود
            </p>
          )}

          {status === "processing" && (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              جاري البحث عن المنتج...
            </p>
          )}

          {status === "success" && resultMessage && (
            <p
              className="flex items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
              role="status"
            >
              <CheckCircle2Icon className="size-4" aria-hidden />
              {resultMessage.title}
              {resultMessage.sub ? <span>— {resultMessage.sub}</span> : null}
            </p>
          )}

          {status === "inactive" && resultMessage && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
                <AlertTriangleIcon className="size-4 shrink-0" aria-hidden />
                {resultMessage.title}
              </p>
              <Button variant="outline" size="sm" type="button" onClick={resetForRescan}>
                إعادة المسح
              </Button>
            </div>
          )}

          {status === "notfound" && resultMessage && (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <p>{resultMessage.title}</p>
              {resultMessage.sub ? (
                <p className="mt-1 text-muted-foreground">
                  الباركود: <span className="font-mono">{resultMessage.sub}</span>
                </p>
              ) : null}
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" type="button" onClick={resetForRescan}>
                  إعادة المسح
                </Button>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              <p className="text-destructive">{errorMessage}</p>
              {resultMessage?.title ? (
                <p className="text-muted-foreground">{resultMessage.title}</p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => start(activeDeviceId ?? undefined)}
                >
                  <RefreshCwIcon className="size-4" aria-hidden />
                  المحاولة مرة أخرى
                </Button>
              </div>
            </div>
          )}
        </div>

        {hasMultipleCameras ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">الكاميرا:</span>
            <select
              value={activeDeviceId ?? ""}
              onChange={(e) => e.target.value && switchCamera(e.target.value)}
              className="flex h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label="اختيار الكاميرا"
            >
              {cameras.map((c, i) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label || `كاميرا ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            <XIcon className="size-4" aria-hidden />
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
