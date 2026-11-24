import type { FormField, FormMap, LocalizedText, PageSize } from "@govnav/shared";
import { ApiError } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:8787";
const TOKEN_KEY = "govnav-officer-token";

export interface FormDetection {
  title: LocalizedText;
  code: string | null;
  pageCount: number;
  pageSizes: PageSize[];
  fields: FormField[];
}

export interface FormListItem {
  id: string;
  code: string;
  name: LocalizedText;
  procedureIds: string[];
  pageCount: number;
}

/** Interim officer access code, kept for this browser tab only (M3: Google sign-in). */
export const officerToken = {
  get: (): string | null => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, v);
    } catch {
      /* private mode */
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

async function call<T>(path: string, init: RequestInit, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers ?? {}), "x-officer-token": token } });
  } catch {
    throw new ApiError(0, "network");
  }
  if (res.status === 401 || res.status === 403) throw new ApiError(res.status, "bad_input");
  if (res.status === 503) throw new ApiError(503, "unavailable");
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const err = new ApiError(res.status, res.status === 422 || res.status === 415 ? "bad_input" : "server");
    (err as ApiError & { detail?: unknown }).detail = detail?.detail;
    throw err;
  }
  return (await res.json()) as T;
}

export const officerApi = {
  detect: (file: File, token: string) => {
    const body = new FormData();
    body.append("file", file);
    return call<FormDetection>("/v1/officer/forms/detect", { method: "POST", body }, token);
  },
  validate: (form: FormMap, token: string) =>
    call<{ ok: boolean; errors: { loc: (string | number)[]; msg: string }[] }>(
      "/v1/officer/forms/validate",
      { method: "POST", body: JSON.stringify(form), headers: { "content-type": "application/json" } },
      token,
    ),
  publish: (form: FormMap, file: File | null, token: string) => {
    const body = new FormData();
    body.append("form_map", JSON.stringify(form));
    if (file) body.append("file", file);
    return call<{ ok: boolean; formId: string; fields: number }>("/v1/officer/forms/publish", { method: "POST", body }, token);
  },
  /** Checks the access code with a harmless validate call. */
  check: async (token: string) => {
    try {
      await call("/v1/officer/forms/validate", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }, token);
      return true;
    } catch (e) {
      return !(e instanceof ApiError && (e.status === 401 || e.status === 403));
    }
  },
  list: async (): Promise<FormListItem[]> => {
    const res = await fetch(`${BASE}/v1/forms`);
    if (!res.ok) return [];
    return ((await res.json()) as { items: FormListItem[] }).items;
  },
  get: async (id: string): Promise<FormMap> => {
    const res = await fetch(`${BASE}/v1/forms/${encodeURIComponent(id)}`);
    if (!res.ok) throw new ApiError(res.status, "not_found");
    return (await res.json()) as FormMap;
  },
  blankPdf: async (id: string): Promise<ArrayBuffer> => {
    const res = await fetch(`${BASE}/v1/forms/${encodeURIComponent(id)}/blank.pdf`);
    if (!res.ok) throw new ApiError(res.status, "not_found");
    return res.arrayBuffer();
  },
};
