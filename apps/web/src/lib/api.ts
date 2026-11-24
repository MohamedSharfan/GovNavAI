import type {
  AskRequest,
  AskResponse,
  District,
  FillPlan,
  FillPlanRequest,
  FormMap,
  Office,
  Procedure,
  ProfileExtractResponse,
} from "@govnav/shared";
import type { Lang } from "@/i18n/dictionaries";

type L10n = Record<Lang, string>;

/** Slim procedure row returned by GET /v1/procedures (see api/main.py `_procedure_summary`). */
export interface ProcedureSummary {
  id: string;
  category: string;
  name: L10n;
  summary: L10n;
  officeType: string;
  office: L10n;
  fee: L10n;
  isFree: boolean;
  processingTime: L10n;
  documentCount: number;
  hasForm: boolean;
  demoData: boolean;
  verifiedAt: string | null;
}

export interface ProcedureDetail {
  procedure: Procedure;
  summary: ProcedureSummary;
  officeIds: string[];
}

export type OfficeRow = Office & { distanceKm: number | null };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly kind: "network" | "rate_limited" | "not_found" | "unavailable" | "bad_input" | "server",
  ) {
    super(`api ${kind} (${status})`);
  }
}

/** Browser calls use the public URL; server components may use a private one. */
function baseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.AGENT_API_URL ?? process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:8787";
  }
  return process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:8787";
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      // FormData bodies must let the browser set the multipart boundary.
      headers:
        init?.body instanceof FormData
          ? (init?.headers ?? {})
          : { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "network");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new ApiError(429, "rate_limited");
  if (res.status === 404) throw new ApiError(404, "not_found");
  if (res.status === 503) throw new ApiError(503, "unavailable");
  if (res.status === 413 || res.status === 415) throw new ApiError(res.status, "bad_input");
  if (!res.ok) throw new ApiError(res.status, "server");
  return (await res.json()) as T;
}

export const api = {
  ask: (body: AskRequest) =>
    request<AskResponse>("/v1/ask", { method: "POST", body: JSON.stringify(body), timeoutMs: 45_000 }),
  procedures: () => request<{ items: ProcedureSummary[]; count: number }>("/v1/procedures"),
  procedure: (id: string) => request<ProcedureDetail>(`/v1/procedures/${encodeURIComponent(id)}`),
  geo: () => request<{ districts: District[] }>("/v1/geo"),
  form: (id: string) => request<Omit<FormMap, "pdfPath">>(`/v1/forms/${encodeURIComponent(id)}`),
  blankFormUrl: (id: string) => `${baseUrl()}/v1/forms/${encodeURIComponent(id)}/blank.pdf`,
  /** Maps the on-device profile onto the form. The server keeps nothing. */
  planForm: (id: string, body: FillPlanRequest) =>
    request<FillPlan>(`/v1/forms/${encodeURIComponent(id)}/plan`, { method: "POST", body: JSON.stringify(body), timeoutMs: 45_000 }),
  /** Returns the official PDF with the confirmed values printed on it. */
  fillForm: async (id: string, values: Record<string, string>): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}/v1/forms/${encodeURIComponent(id)}/fill`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values }),
      });
    } catch {
      throw new ApiError(0, "network");
    }
    if (!res.ok) throw new ApiError(res.status, res.status === 422 ? "bad_input" : "server");
    return res.blob();
  },
  /** Sends one photo for reading. The server keeps nothing (response says imageRetained: false). */
  extractProfile: (photo: Blob) => {
    const body = new FormData();
    body.append("photo", photo, "document");
    return request<ProfileExtractResponse>("/v1/uploads/profile-extract", { method: "POST", body, timeoutMs: 60_000 });
  },
  offices: (params: { procedureId?: string; type?: string; lat?: number; lng?: number } = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
    return request<{ items: OfficeRow[]; count: number }>(`/v1/offices?${q.toString()}`);
  },
};

/** Server-side helper: never throws, returns null when the agent service is down. */
export async function tryServer<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
