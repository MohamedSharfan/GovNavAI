import type { OpeningHours } from "@govnav/shared";
import { describe, expect, it } from "vitest";
import { formatDays, groupHours, isOpenNow, slClock } from "./hours";
import { decodePayload, encodePayload, type QrPayload } from "./visit-pack";

const payload: QrPayload = {
  v: 1,
  p: "income-certificate",
  o: "ds-kuruwita",
  c: ["nic-copy", "request-letter"],
  d: 5,
  f: "imbulpe-ds-income-certificate-request",
  fp: 92,
  n: "R. M. K. රත්නායක",
  l: "si",
  t: "2026-11-24",
};

describe("visit pack QR payload", () => {
  it("round-trips, including Sinhala text", () => {
    const enc = encodePayload(payload);
    expect(enc.startsWith("GNV1:")).toBe(true);
    expect(decodePayload(enc)).toEqual(payload);
  });

  it("never carries an NIC field", () => {
    expect(JSON.stringify(decodePayload(encodePayload(payload)))).not.toMatch(/nic"\s*:/i);
  });

  it.each([
    "hello",
    "GNV1:not-base64-json",
    "GNV2:" + btoa("{}"),
    encodePayload({ ...payload, p: "../../etc" }),
    encodePayload({ ...payload, c: ["<script>"] }),
  ])("rejects malformed or hostile input %#", (raw) => {
    expect(decodePayload(raw)).toBeNull();
  });

  it("clamps the filled percentage", () => {
    expect(decodePayload(encodePayload({ ...payload, fp: 250 }))?.fp).toBe(100);
  });
});

describe("opening hours", () => {
  const hours: OpeningHours[] = [
    { days: [0, 1, 2, 3, 4], open: "08:30", close: "16:15" },
    { days: [5], open: "08:30", close: "12:30" },
  ];
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  it("groups and formats days", () => {
    const rows = groupHours(hours);
    expect(rows).toHaveLength(2);
    expect(formatDays(rows[0]!.days, (d) => names[d]!)).toBe("Mon–Fri");
    expect(formatDays([1, 3], (d) => names[d]!)).toBe("Tue, Thu");
  });

  it("uses Sri Lanka time for open/closed", () => {
    // 2026-11-24 is a Tuesday. 04:00 UTC = 09:30 in Colombo → open.
    expect(slClock(new Date("2026-11-24T04:00:00Z"))).toEqual({ day: 1, minutes: 570 });
    expect(isOpenNow(hours, new Date("2026-11-24T04:00:00Z"))).toBe(true);
    // 11:00 UTC = 16:30 in Colombo → closed.
    expect(isOpenNow(hours, new Date("2026-11-24T11:00:00Z"))).toBe(false);
    // Sunday 10:00 Colombo → closed.
    expect(isOpenNow(hours, new Date("2026-11-29T04:30:00Z"))).toBe(false);
  });
});
