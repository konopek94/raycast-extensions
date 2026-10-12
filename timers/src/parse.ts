export type Repeat =
  { kind: "interval"; seconds: number } | { kind: "daily"; time: string };

export type Parsed = {
  endsAt: number;
  name: string;
  kind: "timer" | "reminder";
  repeat?: Repeat;
};

const UNIT_SECONDS: Record<string, number> = { h: 3600, m: 60, s: 1 };

// "every 30m water", "daily 9am standup", "every day at 9:30 standup"
const REPEAT = /^(?:every|daily)\s+(?:day\s+)?/i;
// "25m tea", "1h30 laundry", "90s", "25 pasta", "in 2h stretch"
const DURATION =
  /^(?:in\s+)?((?:\d+(?:\.\d+)?\s*(?:h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)\s*)+\d*|\d+)(?=\s|$)/i;
// "at 17:00 call mom", "5pm standup", "at 9 gym", "17:30"
const TIME = /^(?:(at)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=\s|$)/i;

export function parse(input: string, now = new Date()): Parsed | undefined {
  const text = input.trim();
  const repeat = text.match(REPEAT);
  const once = parseOnce(repeat ? text.slice(repeat[0].length) : text, now);
  if (!once || !repeat) return once;

  if (once.kind === "reminder") {
    const at = new Date(once.endsAt);
    return {
      ...once,
      repeat: {
        kind: "daily",
        time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
      },
    };
  }
  const seconds = Math.round((once.endsAt - now.getTime()) / 1000);
  // Anything faster than once a minute is a mistake, not a reminder.
  if (seconds < 60) return undefined;
  return { ...once, repeat: { kind: "interval", seconds } };
}

function parseOnce(text: string, now: Date): Parsed | undefined {
  const time = text.match(TIME);
  // A bare number like "25" is a duration in minutes, not 25 o'clock.
  if (time && (time[1] || time[3] || time[4])) {
    let hours = Number(time[2]);
    const minutes = Number(time[3] ?? 0);
    const meridiem = time[4]?.toLowerCase();
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) return undefined;
    return {
      endsAt: nextClockTime(hours, minutes, now.getTime()),
      name: rest(text, time[0]) || "Reminder",
      kind: "reminder",
    };
  }

  const duration = text.match(DURATION);
  if (duration) {
    const seconds = toSeconds(duration[1]);
    if (seconds <= 0) return undefined;
    return {
      endsAt: now.getTime() + seconds * 1000,
      name: rest(text, duration[0]) || "Timer",
      kind: "timer",
    };
  }

  return undefined;
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
  return nextClockTime(hours, minutes, now);
}

export function describeRepeat(repeat: Repeat): string {
  if (repeat.kind === "daily") return `daily at ${repeat.time}`;
  const minutes = Math.round(repeat.seconds / 60);
  return minutes >= 60 && minutes % 60 === 0
    ? `every ${minutes / 60}h`
    : `every ${minutes}m`;
}

function nextClockTime(hours: number, minutes: number, now: number): number {
  const at = new Date(now);
  at.setHours(hours, minutes, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
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

function rest(text: string, matched: string): string {
  return text
    .slice(matched.length)
    .trim()
    .replace(/^(to|for)\s+/i, "");
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
