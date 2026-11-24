/**
 * Sri Lankan validators for the browser, mirroring services/agents/src/govnav_agents/sl/.
 * The profile form gives instant feedback with these; the server re-validates anything it uses.
 */

const NIC_MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // February always 29 (DRP rule)
const FEMALE_OFFSET = 500;

export interface NicInfo {
  normalized: string;
  format: "old" | "new";
  dateOfBirth: string; // ISO YYYY-MM-DD
  gender: "female" | "male";
}

export function normalizeNic(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** Parse an NIC number; returns null when invalid (same rules as the Python parser). */
export function parseNic(raw: string, today: Date = new Date()): NicInfo | null {
  const v = normalizeNic(raw);
  let year: number;
  let encodedDay: number;
  let format: NicInfo["format"];
  const old = /^(\d{2})(\d{3})(\d{4})[VX]$/.exec(v);
  const neu = /^(\d{4})(\d{3})(\d{5})$/.exec(v);
  if (old) {
    year = 1900 + Number(old[1]);
    encodedDay = Number(old[2]);
    format = "old";
  } else if (neu) {
    year = Number(neu[1]);
    encodedDay = Number(neu[2]);
    format = "new";
    if (year < 1900) return null;
  } else {
    return null;
  }
  const gender = encodedDay > FEMALE_OFFSET ? "female" : "male";
  let day = gender === "female" ? encodedDay - FEMALE_OFFSET : encodedDay;
  if (day < 1 || day > 366) return null;
  let month = 0;
  while (month < 12 && day > NIC_MONTH_DAYS[month]!) {
    day -= NIC_MONTH_DAYS[month]!;
    month += 1;
  }
  const dob = new Date(Date.UTC(year, month, day));
  if (dob.getUTCMonth() !== month || dob.getUTCDate() !== day) return null; // 29 Feb in a non-leap year
  if (dob.getTime() > today.getTime()) return null;
  if (format === "new" && today.getUTCFullYear() - year < 15) return null;
  return { normalized: v, format, dateOfBirth: dob.toISOString().slice(0, 10), gender };
}

/** Normalise a Sri Lankan mobile number to "07X XXX XXXX", or null if invalid. */
export function normalizeMobile(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+94")) d = `0${d.slice(3)}`;
  else if (d.startsWith("0094")) d = `0${d.slice(4)}`;
  else if (d.startsWith("94") && d.length === 11) d = `0${d.slice(2)}`;
  const m = /^0(7[0-8])(\d{7})$/.exec(d);
  if (!m) return null;
  return `0${m[1]} ${m[2]!.slice(0, 3)} ${m[2]!.slice(3)}`;
}

/** Sri Lankan forms write dates as YYYY.MM.DD. */
export function formatSlDate(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", ".");
}
