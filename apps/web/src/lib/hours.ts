import type { OpeningHours } from "@govnav/shared";

/** Office hours are Sri Lanka time (UTC+05:30, no DST). */
const SL_OFFSET_MIN = 330;

export interface HoursRow {
  days: number[]; // 0 = Monday … 6 = Sunday
  open: string;
  close: string;
}

/** Merge entries with identical times so "Mon, Tue, Wed, Thu, Fri" becomes one row. */
export function groupHours(hours: OpeningHours[]): HoursRow[] {
  const byTime = new Map<string, Set<number>>();
  for (const h of hours) {
    const key = `${h.open}-${h.close}`;
    const set = byTime.get(key) ?? new Set<number>();
    h.days.forEach((d) => set.add(d));
    byTime.set(key, set);
  }
  return [...byTime.entries()]
    .map(([key, days]) => {
      const [open, close] = key.split("-") as [string, string];
      return { days: [...days].sort((a, b) => a - b), open, close };
    })
    .sort((a, b) => (a.days[0] ?? 0) - (b.days[0] ?? 0));
}

/** "Mon–Fri" for consecutive days, "Tue, Thu" otherwise. */
export function formatDays(days: number[], dayName: (d: number) => string): string {
  if (days.length > 2 && days.every((d, i) => i === 0 || d === (days[i - 1] ?? -2) + 1)) {
    return `${dayName(days[0]!)}–${dayName(days[days.length - 1]!)}`;
  }
  return days.map(dayName).join(", ");
}

/** Sri Lanka weekday (0 = Monday) and minutes since midnight for an instant. */
export function slClock(now: Date): { day: number; minutes: number } {
  const t = new Date(now.getTime() + SL_OFFSET_MIN * 60_000);
  return { day: (t.getUTCDay() + 6) % 7, minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function isOpenNow(hours: OpeningHours[], now: Date = new Date()): boolean {
  const { day, minutes } = slClock(now);
  return hours.some((h) => h.days.includes(day) && minutes >= toMin(h.open) && minutes < toMin(h.close));
}
