/** ISO weekday numbers: 1 = Monday … 7 = Sunday. */
export type Repeat =
  | { kind: "interval"; seconds: number }
  | { kind: "daily"; time: string; days?: number[] };

export type Parsed = {
  endsAt: number;
  name: string;
  kind: "timer" | "reminder";
  repeat?: Repeat;
};

const UNIT_SECONDS: Record<string, number> = { h: 3600, m: 60, s: 1 };
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_NAME =
  "mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";

// "weekdays 9am", "every 30m", "every day at 9", "every mon, wed 18:00", "daily 9am"
const REPEAT = new RegExp(
  `^(?:(weekdays|weekends)\\s+|(?:every|daily)\\s+(?:day\\s+|((?:${DAY_NAME})(?:\\s*(?:,|and|&)\\s*(?:${DAY_NAME}))*)\\s+)?)`,
  "i",
);
// "tomorrow 10am", "fri 18:00", "today 17:30"
const ON_DAY = new RegExp(`^(today|tomorrow|tmrw|${DAY_NAME})(?:\\s+|$)`, "i");
// "25m tea", "1h30 laundry", "90s", "25 pasta", "in 2h stretch"
const DURATION =
  /^(?:in\s+)?((?:\d+(?:\.\d+)?\s*(?:h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)\s*)+\d*|\d+)(?=\s|$)/i;
// "at 17:00", "5pm", "at 9", "17:30", "9.30am"
const TIME = /^(?:(at)\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?=\s|$)/i;

export function parse(input: string, now = new Date()): Parsed | undefined {
  let text = input.trim();
  const nowMs = now.getTime();

  const repeat = text.match(REPEAT);
  let days: number[] | undefined;
  if (repeat) {
    text = text.slice(repeat[0].length);
    if (repeat[1]) {
      days = repeat[1].toLowerCase() === "weekdays" ? [1, 2, 3, 4, 5] : [6, 7];
    } else if (repeat[2]) {
      days = repeat[2].split(/\s*(?:,|and|&)\s*/i).map(isoDay);
    }
  }

  const onDay = repeat ? null : text.match(ON_DAY);
  let tomorrow = false;
  if (onDay) {
    text = text.slice(onDay[0].length);
    const word = onDay[1].toLowerCase();
    if (word === "tomorrow" || word === "tmrw") tomorrow = true;
    else if (word !== "today") days = [isoDay(word)];
  }

  const dayGiven = Boolean(days || onDay);
  // Once a day is named, a bare number is an hour: "tomorrow 9 dentist".
  const clock = matchClock(text, dayGiven);
  if (clock === null) return undefined;
  // "fri dentist" with no time defaults to 9:00.
  if (clock || onDay) {
    const { hours, minutes, rest } = clock ?? {
      hours: 9,
      minutes: 0,
      rest: text,
    };
    const endsAt = tomorrow
      ? tomorrowAt(hours, minutes, nowMs)
      : nextClockTime(hours, minutes, nowMs, days);
    const reminder: Parsed = {
      endsAt,
      name: cleanName(rest) || "Reminder",
      kind: "reminder",
    };
    if (!repeat) return reminder;
    const time = `${pad(hours)}:${pad(minutes)}`;
    return {
      ...reminder,
      repeat: days ? { kind: "daily", time, days } : { kind: "daily", time },
    };
  }
  // "weekdays 30m" has no meaning.
  if (dayGiven) return undefined;

  const duration = text.match(DURATION);
  if (!duration) return undefined;
  const seconds = toSeconds(duration[1]);
  if (seconds <= 0) return undefined;
  const timer: Parsed = {
    endsAt: nowMs + seconds * 1000,
    name: cleanName(text.slice(duration[0].length)) || "Timer",
    kind: "timer",
  };
  if (!repeat) return timer;
  // Anything faster than once a minute is a mistake, not a reminder.
  if (seconds < 60) return undefined;
  return { ...timer, repeat: { kind: "interval", seconds } };
}

/** Returns the clock time at the start of `text`, undefined if there is none, null if it's invalid. */
function matchClock(text: string, allowBareHour: boolean) {
  const time = text.match(TIME);
  // Without "at", ":mm" or am/pm, a bare number like "25" is a duration, not 25 o'clock.
  if (!time || !(time[1] || time[3] || time[4] || allowBareHour)) {
    return undefined;
  }
  let hours = Number(time[2]);
  const minutes = Number(time[3] ?? 0);
  const meridiem = time[4]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes, rest: text.slice(time[0].length) };
}

/** When a (possibly repeating) timer next goes off. */
export function nextAt(
  timer: Pick<Parsed, "endsAt" | "repeat">,
  now = Date.now(),
): number {
  const { endsAt, repeat } = timer;
  if (!repeat || endsAt > now) return endsAt;
  if (repeat.kind === "interval") {
    const step = repeat.seconds * 1000;
    return endsAt + (Math.floor((now - endsAt) / step) + 1) * step;
  }
  const [hours, minutes] = repeat.time.split(":").map(Number);
  return nextClockTime(hours, minutes, now, repeat.days);
}

export function describeRepeat(repeat: Repeat): string {
  if (repeat.kind === "daily") {
    return `${describeDays(repeat.days)} at ${repeat.time}`;
  }
  const minutes = Math.round(repeat.seconds / 60);
  return minutes >= 60 && minutes % 60 === 0
    ? `every ${minutes / 60}h`
    : `every ${minutes}m`;
}

function describeDays(days?: number[]): string {
  const key = days?.join("");
  if (!days || key === "1234567") return "daily";
  if (key === "12345") return "weekdays";
  if (key === "67") return "weekends";
  return days.map((d) => capitalize(DAY_KEYS[d - 1])).join(", ");
}

function nextClockTime(
  hours: number,
  minutes: number,
  now: number,
  days?: number[],
): number {
  for (let offset = 0; offset <= 7; offset++) {
    const at = new Date(now);
    at.setDate(at.getDate() + offset);
    at.setHours(hours, minutes, 0, 0);
    if (at.getTime() > now && (!days || days.includes(isoWeekday(at)))) {
      return at.getTime();
    }
  }
  throw new Error("unreachable: every weekday occurs within 8 days");
}

function tomorrowAt(hours: number, minutes: number, now: number): number {
  const at = new Date(now);
  at.setDate(at.getDate() + 1);
  at.setHours(hours, minutes, 0, 0);
  return at.getTime();
}

function toSeconds(spec: string): number {
  if (/^\d+$/.test(spec)) return Number(spec) * 60;
  let total = 0;
  let lastUnit = "";
  for (const [, amount, unit] of spec.matchAll(
    /(\d+(?:\.\d+)?)\s*([hms]?)/gi,
  )) {
    // A trailing unitless number takes the next smaller unit: "1h30" → 30 minutes.
    const u =
      unit.toLowerCase() ||
      (lastUnit === "h" ? "m" : lastUnit === "m" ? "s" : "m");
    total += Number(amount) * UNIT_SECONDS[u];
    lastUnit = u;
  }
  return Math.round(total);
}

function cleanName(text: string): string {
  return text.trim().replace(/^(to|for)\s+/i, "");
}

const isoDay = (word: string) =>
  DAY_KEYS.indexOf(word.slice(0, 3).toLowerCase()) + 1;
const isoWeekday = (date: Date) => date.getDay() || 7;
const pad = (n: number) => String(n).padStart(2, "0");
const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "14:25", "tomorrow 10:00", "Fri 18:00", or "3 Nov 09:00" further out. */
export function formatClock(ms: number, now = Date.now()): string {
  const at = new Date(ms);
  const time = at.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const days = Math.round((startOfDay(ms) - startOfDay(now)) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `tomorrow ${time}`;
  if (days < 7) return `${capitalize(DAY_KEYS[isoWeekday(at) - 1])} ${time}`;
  return `${at.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
