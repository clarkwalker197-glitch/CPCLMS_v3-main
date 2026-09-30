"use client";

import { ModalLayer } from "@/components/ModalLayer";
import { useState, useEffect, useRef, useCallback, useId } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { formatBorrowId, normalizeBorrowId } from "@/lib/borrow-id";

interface QRScannerProps {
  onScan: (data: string) => Promise<void> | void;
  onClose: () => void;
  loading?: boolean;
  title?: string;
  entryHint?: string;
  placeholder?: string;
  submitLabel?: string;
  externalError?: string;
}

export function QRScanner({
  onScan,
  onClose,
  loading = false,
  title = "Scan QR Code",
  entryHint = "If QR scan fails, enter the Borrow ID.",
  placeholder = "BRW-1234-5678",
  submitLabel = "Submit",
  externalError = "",
}: QRScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [error, setError] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [lastResult, setLastResult] = useState<string>("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanHandledRef = useRef(false);
  const scannerElementId = `qr-scanner-${useId().replace(/:/g, "")}`;
  const mountedRef = useRef(true);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      scannerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
    if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
    fallbackIntervalRef.current = null;
    fallbackTimeoutRef.current = null;
    setScanning(false);
    setScannerEnabled(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
      fallbackIntervalRef.current = null;
      fallbackTimeoutRef.current = null;
    };
  }, [stopScanner]);

  // List available cameras
  const listCameras = useCallback(async () => {
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      permissionStream.getTracks().forEach((track) => track.stop());
      const devices = await Html5Qrcode.getCameras();
      if (!mountedRef.current) return;
      if (devices.length > 0) {
        const camList = devices.map((d) => ({ id: d.id, label: d.label || `Camera ${d.id.slice(0, 8)}` }));
        setCameras(camList);
        // Prefer back/environment camera
        const backCam = camList.find(
          (c) => /back|rear|environment/i.test(c.label)
        );
        setSelectedCamera(backCam?.id || camList[0].id);
      } else {
        setError("No cameras found. Use manual entry below.");
      }
    } catch (err: any) {
      if (mountedRef.current) {
        const permissionDenied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
        setError(permissionDenied
          ? "Camera permission was denied. Allow camera access in your browser settings or use manual entry below."
          : "Could not access the camera. Use manual entry below.");
      }
    }
  }, []);

  // Start scanner
  const startScanner = useCallback(async (cameraId: string) => {
    if (!cameraId) return;
    scanHandledRef.current = false;
    setScanning(true);
    setError("");

    try {
      // Ensure the element exists
      const existingEl = document.getElementById(scannerElementId);
      if (!existingEl) {
        setError("Scanner element not found");
        setScanning(false);
        setScannerEnabled(false);
        return;
      }

      // Clean up any previous instance
      if (scannerRef.current) {
        try { await scannerRef.current.stop(); } catch {}
      }

      const scanner = new Html5Qrcode(scannerElementId);
      scannerRef.current = scanner;

      await scanner.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          if (!mountedRef.current || scanHandledRef.current) return;
          scanHandledRef.current = true;
          const borrowId = normalizeBorrowId(decodedText);
          if (!borrowId) {
            setError("This QR code does not contain a valid Borrow ID.");
            void stopScanner();
            return;
          }
          setLastResult(formatBorrowId(borrowId));
          stopScanner();
          onScan(borrowId);
        },
        () => {
          // Ignore individual frame failures
        }
      );
      const video = existingEl.querySelector("video");
      if (video) {
        video.setAttribute("playsinline", "true");
        video.muted = true;
        video.style.display = "block";
        video.style.width = "100%";
        video.style.height = "auto";
        video.style.minHeight = "250px";
        video.style.objectFit = "cover";
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      console.error("Scanner start failed:", err);

      // Fallback: try BarcodeDetector API
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        setError("QR scanner could not start. Trying the device camera directly...");
        tryFallbackBarcodeDetector();
      } else {
        const permissionDenied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
        setError(permissionDenied
          ? "Camera permission was denied. Allow camera access in your browser settings or use manual entry below."
          : err?.message || "Failed to start camera. Use manual entry below.");
        setScanning(false);
        setScannerEnabled(false);
      }
    }
  }, [onScan, scannerElementId, stopScanner]);

  // Fallback: use native BarcodeDetector API
  const tryFallbackBarcodeDetector = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }

      const videoEl = document.createElement("video");
      const viewport = document.getElementById(scannerElementId);
      if (!viewport) throw new Error("Scanner element not found");
      viewport.replaceChildren(videoEl);
      videoEl.className = "w-full h-auto min-h-[250px] object-cover";
      videoEl.srcObject = stream;
      videoEl.setAttribute("playsinline", "true");
      videoEl.muted = true;
      await videoEl.play();

      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      let timeoutId: ReturnType<typeof setTimeout>;
      const checkInterval = setInterval(async () => {
        if (!mountedRef.current) {
          clearInterval(checkInterval);
          fallbackIntervalRef.current = null;
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        try {
          const barcodes = await detector.detect(videoEl);
          if (barcodes.length > 0) {
            if (scanHandledRef.current) return;
            scanHandledRef.current = true;
            clearInterval(checkInterval);
            fallbackIntervalRef.current = null;
            clearTimeout(timeoutId);
            fallbackTimeoutRef.current = null;
            stream.getTracks().forEach(t => t.stop());
            streamRef.current = null;
            videoEl.remove();
            if (mountedRef.current) {
              const borrowId = normalizeBorrowId(barcodes[0].rawValue);
              if (!borrowId) {
                setError("This QR code does not contain a valid Borrow ID.");
                setScannerEnabled(false);
                setScanning(false);
                return;
              }
              setLastResult(formatBorrowId(borrowId));
              setScannerEnabled(false);
              setScanning(false);
              onScan(borrowId);
            }
          }
        } catch {
          // continue scanning
        }
      }, 500);
      fallbackIntervalRef.current = checkInterval;

      timeoutId = setTimeout(() => {
        clearInterval(checkInterval);
        fallbackIntervalRef.current = null;
        fallbackTimeoutRef.current = null;
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        videoEl.remove();
        if (mountedRef.current) {
          setScanning(false);
          setScannerEnabled(false);
          setError("Scan timed out. Enter the Borrow ID manually.");
        }
      }, 30000);
      fallbackTimeoutRef.current = timeoutId;
    } catch {
      if (mountedRef.current) {
        setError("Camera access denied. Use manual entry below.");
        setScanning(false);
        setScannerEnabled(false);
      }
    }
  }, [onScan, lastResult]);

  // Initialize on mount
  useEffect(() => {
    listCameras();
  }, [listCameras]);

  // Start scanning when camera is selected
  useEffect(() => {
    if (selectedCamera && scannerEnabled && !scanning) {
      startScanner(selectedCamera);
    }
  }, [selectedCamera, startScanner, scanning, scannerEnabled]);

  const handleCameraChange = async (cameraId: string) => {
    await stopScanner();
    setSelectedCamera(cameraId);
    setScannerEnabled(true);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const borrowId = normalizeBorrowId(manualInput);
    if (!borrowId) {
      setError("Enter a valid Borrow ID, such as BRW-1234-5678.");
      return;
    }

    setLastResult(formatBorrowId(borrowId));
    setError("");
    try {
      await onScan(borrowId);
    } catch {
      setError("Failed to process this transaction.");
    }
  };

  return (
    <ModalLayer>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 w-full max-w-md rounded-xl bg-white shadow-lg p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-zinc-800">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-100 text-zinc-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Camera selector */}
        {cameras.length > 1 && (
          <div className="mb-3">
            <select
              value={selectedCamera}
              onChange={(e) => handleCameraChange(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Scanner viewport */}
        <div className="bg-zinc-900 rounded-lg overflow-hidden mb-4 relative" style={{ minHeight: "250px" }}>
          {/* HTML5 QR Code scanner mounts here */}
          <div id={scannerElementId} className="w-full min-h-[250px]" />

          {!scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-zinc-400 text-sm">Camera inactive</p>
            </div>
          )}

          {/* Scan overlay */}
          {scanning && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-emerald-400 rounded-lg opacity-60" />
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <span className="text-xs text-white/70 bg-black/40 px-2 py-1 rounded-full">
                  Point at QR code
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Error messages */}
        {(error || externalError) && (
          <div className="p-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            {error || externalError}
          </div>
        )}

        {/* Manual entry */}
        <form onSubmit={handleManualSubmit} className="mb-3">
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Or enter the Borrow ID manually
          </label>
          <p className="text-xs text-zinc-500 mb-2">
            {entryHint}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value.toUpperCase().slice(0, 13))}
              maxLength={13}
              placeholder={placeholder}
              className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono uppercase"
            />
            <button
              type="submit"
              disabled={!normalizeBorrowId(manualInput) || loading}
              className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors font-medium"
            >
              {submitLabel}
            </button>
          </div>
        </form>

        {/* Control buttons */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => {
              if (scanning) {
                void stopScanner();
              } else {
                setError("");
                setScannerEnabled(true);
                if (selectedCamera) {
                  void startScanner(selectedCamera);
                } else {
                  void listCameras();
                }
              }
            }}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
          >
            {scanning ? "Stop Scanning" : "Restart Camera"}
          </button>
        </div>

        {/* Last result indicator */}
        {loading && (
          <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Verifying Borrow ID...
          </div>
        )}

        {!loading && lastResult && (
          <div className="mt-3 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 truncate">
            ✅ Scanned: {lastResult.length > 50 ? lastResult.slice(0, 50) + "..." : lastResult}
          </div>
        )}
      </div>
      </div>
    </ModalLayer>
  );
}

// Extend Window type for BarcodeDetector
declare global {
  interface Window {
    BarcodeDetector?: new (config?: { formats: string[] }) => {
      detect(image: HTMLVideoElement): Promise<{ rawValue: string }[]>;
    };
  }
}

