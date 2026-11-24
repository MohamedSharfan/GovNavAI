import { describe, expect, it } from "vitest";
import { moveBox, newBox, resizeBox, slugify } from "./bbox";

describe("Form Studio box geometry", () => {
  const b = { x: 0.8, y: 0.9, w: 0.15, h: 0.05 };
  it("keeps moved boxes on the page", () => {
    expect(moveBox(b, 0.2, 0.2)).toEqual({ x: 0.85, y: 0.95, w: 0.15, h: 0.05 });
    expect(moveBox(b, -1, -1)).toEqual({ x: 0, y: 0, w: 0.15, h: 0.05 });
  });
  it("clamps resizing to the page and a minimum size", () => {
    expect(resizeBox(b, 1, 1)).toEqual({ x: 0.8, y: 0.9, w: 0.2, h: 0.1 });
    expect(resizeBox(b, -1, -1)).toEqual({ x: 0.8, y: 0.9, w: 0.02, h: 0.01 });
  });
  it("creates valid ids", () => {
    const taken = new Set(["applicant-name"]);
    expect(slugify("Applicant name", taken)).toBe("applicant-name-2");
    expect(slugify("ඉල්ලුම් කරු", new Set())).toBe("field");
    expect(newBox().x + newBox().w).toBeLessThanOrEqual(1);
  });
});
