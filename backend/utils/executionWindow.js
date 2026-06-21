/**
 * Determines whether the current moment falls within a job's execution window.
 *
 * @param {object|null} executionWindow - The executionWindow sub-document from the job model.
 * @param {string} [timezone="UTC"] - IANA timezone string (e.g. "America/New_York").
 * @param {Date} [now=new Date()] - Override for the current time (useful in tests).
 * @returns {boolean} true if the job should run; false if it must be skipped.
 */
export function isWithinExecutionWindow(
  executionWindow,
  timezone = "UTC",
  now = new Date(),
) {
  // No window configured or window not enabled → always run.
  if (!executionWindow || !executionWindow.enabled) {
    return true;
  }

  const tz = timezone || "UTC";

  // Resolve current time parts in the job's timezone.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find((p) => p.type === "hour")?.value?.padStart(2, "0") ?? "00";
  const minuteStr = parts.find((p) => p.type === "minute")?.value?.padStart(2, "0") ?? "00";

  // Normalise the hour — Intl sometimes returns "24" for midnight.
  const currentTime = `${hourStr === "24" ? "00" : hourStr}:${minuteStr}`;

  // Map en-US short weekday names to Axon day codes.
  const DAY_MAP = {
    Mon: "M",
    Tue: "T",
    Wed: "W",
    Thu: "Th",
    Fri: "F",
    Sat: "Sa",
    Sun: "Su",
  };
  const currentDay = DAY_MAP[weekdayStr];

  const {
    activeDays = [],
    startTime = "00:00",
    endTime = "23:59",
  } = executionWindow;

  // Check active days (empty list means all days are allowed).
  if (activeDays.length > 0 && (!currentDay || !activeDays.includes(currentDay))) {
    return false;
  }

  // Check time bounds (lexicographic "HH:MM" comparison is correct here).
  if (currentTime < startTime || currentTime > endTime) {
    return false;
  }

  return true;
}
