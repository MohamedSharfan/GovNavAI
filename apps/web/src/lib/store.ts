/**
 * On-device storage (IndexedDB). The citizen's profile and "My requests" never
 * leave the phone except for the single request that needs them (PDPA No. 9 of 2022).
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CitizenRequest, Office, Profile } from "@govnav/shared";
import type { Lang } from "@/i18n/dictionaries";

type L10n = Record<Lang, string>;

/** Everything the Visit pack shows, snapshotted on the device so it opens offline. */
export interface VisitPackSnapshot {
  procedureId: string;
  requestId: string;
  createdAt: string;
  procedure: { name: L10n; fee: L10n; time: L10n; officeFlow: L10n };
  office: Office | null;
  documents: { id: string; name: L10n; conditional: L10n | null; done: boolean }[];
  form: { id: string; code: string; name: L10n; filledPct: number | null; byHand: L10n[] } | null;
  qr: string;
}

interface GovNavDB extends DBSchema {
  requests: { key: string; value: CitizenRequest; indexes: { byUpdated: string } };
  profile: { key: "me"; value: Profile };
  packs: { key: string; value: VisitPackSnapshot };
}

let dbPromise: Promise<IDBPDatabase<GovNavDB>> | null = null;

function db(): Promise<IDBPDatabase<GovNavDB>> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  dbPromise ??= openDB<GovNavDB>("govnav", 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        const requests = d.createObjectStore("requests", { keyPath: "id" });
        requests.createIndex("byUpdated", "updatedAt");
        d.createObjectStore("profile");
      }
      if (oldVersion < 2) d.createObjectStore("packs", { keyPath: "procedureId" });
    },
  });
  return dbPromise;
}

const nowIso = () => new Date().toISOString();

export async function listRequests(): Promise<CitizenRequest[]> {
  try {
    const all = await (await db()).getAllFromIndex("requests", "byUpdated");
    return all.reverse();
  } catch {
    return [];
  }
}

export async function getRequest(id: string): Promise<CitizenRequest | undefined> {
  try {
    return await (await db()).get("requests", id);
  } catch {
    return undefined;
  }
}

export async function getOpenRequestFor(procedureId: string): Promise<CitizenRequest | undefined> {
  try {
    return (await (await db()).getAll("requests")).find(
      (r) => r.procedureId === procedureId && r.status !== "visited",
    );
  } catch {
    return undefined;
  }
}

/** One open request per procedure: looking a procedure up again resumes it. */
export async function touchRequest(
  procedureId: string,
  language: CitizenRequest["language"],
  patch: Partial<CitizenRequest> = {},
): Promise<CitizenRequest | null> {
  try {
    const d = await db();
    const existing = (await d.getAll("requests")).find(
      (r) => r.procedureId === procedureId && r.status !== "visited",
    );
    const next: CitizenRequest = existing
      ? { ...existing, ...patch, language, updatedAt: nowIso() }
      : {
          id: crypto.randomUUID(),
          procedureId,
          language,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          status: "exploring",
          checklist: {},
          filledValues: {},
          outcome: "unknown",
          ...patch,
        };
    await d.put("requests", next);
    return next;
  } catch {
    return null;
  }
}

export async function getProfile(): Promise<Profile | undefined> {
  try {
    return await (await db()).get("profile", "me");
  } catch {
    return undefined;
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await (await db()).put("profile", profile, "me");
}

export async function savePack(pack: VisitPackSnapshot): Promise<void> {
  try {
    await (await db()).put("packs", pack);
  } catch {
    /* storage unavailable: the pack still renders from live data */
  }
}

export async function getPack(procedureId: string): Promise<VisitPackSnapshot | undefined> {
  try {
    return await (await db()).get("packs", procedureId);
  } catch {
    return undefined;
  }
}

/** "Delete my data": wipes profile, request history and visit packs from this device. */
export async function deleteAllMyData(): Promise<void> {
  const d = await db();
  await Promise.all([d.clear("requests"), d.clear("profile"), d.clear("packs")]);
}

// A question typed on Home is handed to /ask via sessionStorage (never the URL).
const PENDING_KEY = "govnav-pending-question";
export function setPendingQuestion(q: string): void {
  try {
    sessionStorage.setItem(PENDING_KEY, q);
  } catch {
    /* private mode: the chat simply opens empty */
  }
}
export function takePendingQuestion(): string | null {
  try {
    const q = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return q;
  } catch {
    return null;
  }
}
