"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders one page of a PDF (or an image) to fill its container width, with an
 * absolutely positioned overlay layer for children (used by the Form Studio editor).
 */
export function PdfPage({
  source,
  page,
  onPageCount,
  children,
}: {
  source: { kind: "pdf"; data: ArrayBuffer } | { kind: "image"; url: string };
  page: number;
  onPageCount?: (n: number) => void;
  children?: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (source.kind !== "pdf") return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      // pdf.js transfers (detaches) the buffer it is given, so pass a copy.
      const task = pdfjs.getDocument({ data: new Uint8Array(source.data.slice(0)) });
      destroy = () => void task.destroy();
      const doc = await task.promise;
      onPageCount?.(doc.numPages);
      const p = await doc.getPage(page + 1);
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const cssWidth = canvas.parentElement?.clientWidth ?? 600;
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: (cssWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2) });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await p.render({ canvas, viewport }).promise;
      if (!cancelled) setReady(true);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [source, page, onPageCount]);

  return (
    <div className="relative w-full select-none bg-white shadow-md ring-1 ring-line">
      {source.kind === "pdf" ? (
        <canvas ref={canvasRef} className="block h-auto w-full" aria-hidden />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL of the uploaded scan
        <img src={source.url} alt="" className="block h-auto w-full" onLoad={() => setReady(true)} />
      )}
      {(ready || source.kind === "image") && <div className="absolute inset-0">{children}</div>}
    </div>
  );
}
