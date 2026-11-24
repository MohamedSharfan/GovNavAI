"use client";

import type { FillPlanField } from "@govnav/shared";
import { PenLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Marker {
  field: FillPlanField;
  label: string;
}

/**
 * Renders page 1 of the filled PDF with PDF.js, on a warm "paper" card, and overlays
 * the amber sign-here callouts at the exact field positions from the form map.
 */
export function PdfPreview({
  pdf,
  markers,
  page = 0,
  fallback,
}: {
  pdf: Blob;
  markers: Marker[];
  page?: number;
  fallback: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
        destroy = () => void task.destroy();
        const doc = await task.promise;
        const p = await doc.getPage(page + 1);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const cssWidth = canvas.parentElement?.clientWidth ?? 360;
        const base = p.getViewport({ scale: 1 });
        const scale = (cssWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2);
        const viewport = p.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await p.render({ canvas, viewport }).promise;
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [pdf, page]);

  if (state === "failed") return <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">{fallback}</p>;

  return (
    <div className="relative overflow-hidden rounded-lg bg-[#fffdf8] shadow-md ring-1 ring-line">
      <canvas ref={canvasRef} className="block h-auto w-full" aria-hidden />
      {state === "ready" &&
        markers
          .filter((m) => m.field.page === page)
          .map(({ field, label }) => (
            <div
              key={field.id}
              className="pointer-events-none absolute rounded-md border-2 border-dashed border-saffron bg-saffron/15"
              style={{
                left: `${field.bbox.x * 100}%`,
                top: `${field.bbox.y * 100}%`,
                width: `${field.bbox.w * 100}%`,
                height: `${Math.max(field.bbox.h * 100, 2.2)}%`,
              }}
            >
              <span className="absolute -top-7 right-0 flex items-center gap-1 rounded-md bg-saffron px-1.5 py-0.5 text-[0.65rem] font-bold whitespace-nowrap text-white">
                <PenLine aria-hidden className="size-3" />
                {label}
              </span>
            </div>
          ))}
      {state === "loading" && <div className="absolute inset-0 animate-pulse bg-surface-2" aria-hidden />}
    </div>
  );
}
