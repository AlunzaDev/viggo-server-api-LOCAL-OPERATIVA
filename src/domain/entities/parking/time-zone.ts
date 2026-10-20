/** Zone of projects that have not chosen one (where every parking was until zones existed). */
export const DEFAULT_TIME_ZONE = "America/Mexico_City";

/** An IANA zone the runtime knows, e.g. "America/Tijuana". */
export const isValidTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string" || !value.trim() || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Day of the week (0 = Sunday) and minutes since midnight of `at` in the parking's zone, not
 * the server's: a schedule "7:00 to 22:00" means 7:00 where the parking is.
 */
export const localClock = (at: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE,
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return { weekDay: WEEK_DAYS.indexOf(part("weekday")), minutes: Number(part("hour")) * 60 + Number(part("minute")) };
};
