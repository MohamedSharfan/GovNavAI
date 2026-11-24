/**
 * Visit pack: a one-page summary the citizen carries to the office.
 *
 * The QR code holds a compact, versioned payload ("GNV1:" + base64url JSON) that the
 * officer's Counter view decodes OFFLINE. Nothing is uploaded or looked up on a server.
 * It deliberately carries no NIC number: the officer sees the physical NIC anyway.
 */
import type { Lang } from "@/i18n/dictionaries";

export interface QrPayload {
  v: 1;
  p: string; // procedure id
  o: string | null; // office id
  c: string[]; // ticked document ids
  d: number; // total documents
  f: string | null; // form id
  fp: number | null; // % of form filled
  n: string | null; // name with initials (optional)
  l: Lang;
  t: string; // issued YYYY-MM-DD
}

const PREFIX = "GNV1:";

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

export function encodePayload(p: QrPayload): string {
  return PREFIX + toBase64Url(JSON.stringify(p));
}

/** Strict decoder for the Counter view: rejects anything that is not a well-formed v1 payload. */
export function decodePayload(raw: string): QrPayload | null {
  if (!raw.startsWith(PREFIX) || raw.length > 2000) return null;
  try {
    const o = JSON.parse(fromBase64Url(raw.slice(PREFIX.length))) as Partial<QrPayload>;
    const slug = /^[a-z0-9-]{2,64}$/;
    if (o.v !== 1 || typeof o.p !== "string" || !slug.test(o.p)) return null;
    if (!Array.isArray(o.c) || !o.c.every((x) => typeof x === "string" && slug.test(x))) return null;
    if (typeof o.d !== "number" || !["si", "ta", "en"].includes(o.l as string)) return null;
    return {
      v: 1,
      p: o.p,
      o: typeof o.o === "string" && slug.test(o.o) ? o.o : null,
      c: o.c,
      d: o.d,
      f: typeof o.f === "string" && slug.test(o.f) ? o.f : null,
      fp: typeof o.fp === "number" ? Math.max(0, Math.min(100, Math.round(o.fp))) : null,
      n: typeof o.n === "string" ? o.n.slice(0, 80) : null,
      l: o.l as Lang,
      t: typeof o.t === "string" ? o.t.slice(0, 10) : "",
    };
  } catch {
    return null;
  }
}
