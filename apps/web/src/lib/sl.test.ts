import { describe, expect, it } from "vitest";
import { formatSlDate, normalizeMobile, parseNic } from "./sl";

const TODAY = new Date(Date.UTC(2026, 10, 24));

describe("parseNic (mirrors tests/test_sl_nic.py)", () => {
  it.each([
    ["197412401987", "1974-05-03", "male", "new"],
    ["197462401987", "1974-05-03", "female", "new"],
    ["746240198V", "1974-05-03", "female", "old"],
    ["746240198x", "1974-05-03", "female", "old"],
    ["850011234V", "1985-01-01", "male", "old"],
    ["853661234V", "1985-12-31", "male", "old"],
    ["850611234V", "1985-03-01", "male", "old"],
    ["200056012345", "2000-02-29", "female", "new"],
    ["1974 124 01987", "1974-05-03", "male", "new"],
  ])("%s → %s %s", (nic, dob, gender, format) => {
    expect(parseNic(nic, TODAY)).toMatchObject({ dateOfBirth: dob, gender, format });
  });

  it.each([
    "",
    "12345",
    "74624019V",
    "7462401980V",
    "746240198Z",
    "19741240198",
    "850001234V",
    "853671234V",
    "855001234V",
    "858671234V",
    "850601234V",
    "203012401987",
    "201512401987",
  ])("rejects %s", (nic) => {
    expect(parseNic(nic, TODAY)).toBeNull();
  });
});

describe("normalizeMobile", () => {
  it.each([
    ["0771234567", "077 123 4567"],
    ["+94771234567", "077 123 4567"],
    ["0094 71 234 5678", "071 234 5678"],
  ])("%s → %s", (raw, out) => expect(normalizeMobile(raw)).toBe(out));
  it.each(["0112345678", "0791234567", "hello"])("rejects %s", (raw) => expect(normalizeMobile(raw)).toBeNull());
});

it("formats SL dates", () => expect(formatSlDate("2026-08-24")).toBe("2026.08.24"));
