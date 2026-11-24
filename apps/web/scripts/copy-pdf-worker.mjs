// Serve the PDF.js worker from /pdfjs so the form preview works offline and without bundler quirks.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
mkdirSync("public/pdfjs", { recursive: true });
copyFileSync(src, "public/pdfjs/pdf.worker.min.mjs");
console.log("copied pdf.worker.min.mjs → public/pdfjs/");
