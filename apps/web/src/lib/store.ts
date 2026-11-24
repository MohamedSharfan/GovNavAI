/**
 * On-device storage (IndexedDB). The citizen's profile and "My requests" never
 * leave the phone except for the single request that needs them (PDPA No. 9 of 2022).
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CitizenRequest, Profile } from "@govnav/shared";

interface GovNavDB extends DBSchema {
  requests: { key: string; value: CitizenRequest; indexes: { byUpdated: string } };
  profile: { key: "me"; value: Profile };
}

let dbPromise: Promise<IDBPDatabase<GovNavDB>> | null = null;

function db(): Promise<IDBPDatabase<GovNavDB>> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  dbPromise ??= openDB<GovNavDB>("govnav", 1, {
    upgrade(d) {
      const requests = d.createObjectStore("requests", { keyPath: "id" });
      requests.createIndex("byUpdated", "updatedAt");
      d.createObjectStore("profile");
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

/** "Delete my data": wipes profile and request history from this device. */
export async function deleteAllMyData(): Promise<void> {
  const d = await db();
  await Promise.all([d.clear("requests"), d.clear("profile")]);
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
