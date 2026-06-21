import { describe, it, expect } from "vitest";
import { isWithinExecutionWindow } from "../utils/executionWindow.js";

// Helper: build a Date for a specific UTC hour/minute on a known weekday.
// 2024-01-08 is a Monday.
function utcDate(dayOffset, hour, minute) {
  return new Date(Date.UTC(2024, 0, 8 + dayOffset, hour, minute, 0));
}
// 2024-01-08 00:00 UTC → Monday
const MONDAY    = utcDate(0,  9, 0);   // Mon 09:00 UTC
const TUESDAY   = utcDate(1, 14, 0);   // Tue 14:00 UTC
const WEDNESDAY = utcDate(2, 22, 0);   // Wed 22:00 UTC
const SATURDAY  = utcDate(5,  8, 0);   // Sat 08:00 UTC

describe("isWithinExecutionWindow", () => {
  // ── disabled / null ───────────────────────────────────────────────────────

  it("returns true when executionWindow is null", () => {
    expect(isWithinExecutionWindow(null, "UTC", MONDAY)).toBe(true);
  });

  it("returns true when executionWindow.enabled is false", () => {
    expect(
      isWithinExecutionWindow(
        { enabled: false, startTime: "10:00", endTime: "11:00", activeDays: ["M"] },
        "UTC",
        MONDAY,
      ),
    ).toBe(true);
  });

  // ── time bounds ───────────────────────────────────────────────────────────

  it("returns true when current time is inside the window", () => {
    // Mon 09:00 UTC, window 08:00–18:00, all days
    expect(
      isWithinExecutionWindow(
        { enabled: true, startTime: "08:00", endTime: "18:00", activeDays: [] },
        "UTC",
        MONDAY,
      ),
    ).toBe(true);
  });

  it("returns false when current time is before startTime", () => {
    // Mon 09:00 UTC, window 10:00–18:00
    expect(
      isWithinExecutionWindow(
        { enabled: true, startTime: "10:00", endTime: "18:00", activeDays: [] },
        "UTC",
        MONDAY,
      ),
    ).toBe(false);
  });

  it("returns false when current time is after endTime", () => {
    // Wed 22:00 UTC, window 08:00–20:00
    expect(
      isWithinExecutionWindow(
        { enabled: true, startTime: "08:00", endTime: "20:00", activeDays: [] },
        "UTC",
        WEDNESDAY,
      ),
    ).toBe(false);
  });

  it("returns true when current time equals startTime", () => {
    expect(
      isWithinExecutionWindow(
        { enabled: true, startTime: "09:00", endTime: "18:00", activeDays: [] },
        "UTC",
        MONDAY,
      ),
    ).toBe(true);
  });

  it("returns true when current time equals endTime", () => {
    expect(
      isWithinExecutionWindow(
        { enabled: true, startTime: "08:00", endTime: "09:00", activeDays: [] },
        "UTC",
        MONDAY,
      ),
    ).toBe(true);
  });

  // ── active days ───────────────────────────────────────────────────────────

  it("returns true when the current day is in activeDays", () => {
    // Saturday, window all-day, activeDays includes Sa
    expect(
      isWithinExecutionWindow(
        { enabled: true, startTime: "00:00", endTime: "23:59", activeDays: ["M", "Sa"] },
        "UTC",
        SATURDAY,
      ),
    ).toBe(true);
  });

  it("returns false when the current day is NOT in activeDays", () => {
    // Tuesday, activeDays only M/W/F
    expect(
      isWithinExecutionWindow(
        { enabled: true, startTime: "00:00", endTime: "23:59", activeDays: ["M", "W", "F"] },
        "UTC",
        TUESDAY,
      ),
    ).toBe(false);
  });

  it("returns true when activeDays is empty (all days allowed)", () => {
    expect(
      isWithinExecutionWindow(
        { enabled: true, startTime: "00:00", endTime: "23:59", activeDays: [] },
        "UTC",
        TUESDAY,
      ),
    ).toBe(true);
  });

  // ── timezone conversion ───────────────────────────────────────────────────

  it("applies timezone offset when evaluating bounds", () => {
    // 2024-01-08 09:00 UTC = 2024-01-08 04:00 America/New_York (EST = UTC-5).
    // Window 05:00–18:00 → 04:00 is before start → should skip.
    expect(
      isWithinExecutionWindow(
        { enabled: true, startTime: "05:00", endTime: "18:00", activeDays: [] },
        "America/New_York",
        MONDAY,
      ),
    ).toBe(false);

    // Window 03:00–18:00 → 04:00 is inside → should run.
    expect(
      isWithinExecutionWindow(
        { enabled: true, startTime: "03:00", endTime: "18:00", activeDays: [] },
        "America/New_York",
        MONDAY,
      ),
    ).toBe(true);
  });

  // ── missing / default fields ──────────────────────────────────────────────

  it("uses 00:00–23:59 defaults when startTime/endTime are absent", () => {
    expect(
      isWithinExecutionWindow(
        { enabled: true },
        "UTC",
        MONDAY,
      ),
    ).toBe(true);
  });

  it("falls back to UTC when timezone is undefined", () => {
    expect(
      isWithinExecutionWindow(
        { enabled: true, startTime: "00:00", endTime: "23:59", activeDays: [] },
        undefined,
        MONDAY,
      ),
    ).toBe(true);
  });
});
