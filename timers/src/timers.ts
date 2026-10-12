import { environment, getPreferenceValues, LocalStorage } from "@raycast/api";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { nextAt, type Parsed } from "./parse";

export type Timer = Parsed & {
  id: string;
  createdAt: number;
  /** 0 while paused. */
  pid: number;
  /** Set while paused: how much was left when it was paused. */
  pausedRemaining?: number;
};

const KEY = "timers";
const HISTORY_KEY = "history";
const HISTORY_SIZE = 15;
// Passed as the shell's $0 so `ps` can tell our alert processes from a reused pid.
const MARKER = "raycastini-timer";

// Runs detached so it fires even after Raycast unloads the extension.
// User text arrives as positional arguments, never interpolated into the script.
// Args: delay, name, title, repeat ("" | seconds | daily:HH:MM:isoDays), sound path,
// snooze seconds, snooze label, Raycast deeplink to the Ringing command, stop file
const ALERT_SCRIPT = `
NAME=$2 TITLE=$3 REPEAT=$4 SOUND=$5 SNOOZE=$6 SNOOZE_LABEL=$7 URL=$8 STOP=$9
# Fallback when Raycast can't be opened: a plain system dialog.
dialog() {
  if [ -n "$SOUND" ]; then afplay "$SOUND" & fi
  btn=$(osascript -e 'on run argv' -e 'display dialog (item 1 of argv) with title (item 2 of argv) buttons {item 3 of argv, "Done"} default button "Done" with icon note' -e 'end run' "$NAME" "$TITLE" "$SNOOZE_LABEL")
  case "$btn" in *"$SNOOZE_LABEL"*) sleep "$SNOOZE"; dialog ;; esac
}
alert() {
  rm -f "$STOP"
  if open "$URL"; then
    # Keep ringing until the Ringing view creates the stop file (Done, Snooze or Esc), ~1 min max.
    i=0
    while [ -n "$SOUND" ] && [ "$i" -lt 40 ] && [ ! -e "$STOP" ]; do afplay "$SOUND"; i=$((i + 1)); done
  else
    dialog
  fi
}
sleep "$1"
case "$REPEAT" in
  "") alert ;;
  daily:*)
    SPEC=\${REPEAT#daily:}; HM=\${SPEC%:*}; DAYS=\${SPEC##*:}
    while :; do
      alert &
      sleep 60
      now=$(date +%s)
      # Next HH:MM on an allowed weekday; -v+Nd keeps the wall-clock time across DST.
      n=0
      while :; do
        t=$(date -j -v+"$n"d -f %H:%M:%S "$HM:00" +%s)
        if [ "$t" -gt "$now" ]; then
          case "$DAYS" in *"$(date -r "$t" +%u)"*) break ;; esac
        fi
        n=$((n + 1))
      done
      sleep $((t - now))
    done ;;
  *) while :; do alert & sleep "$REPEAT"; done ;;
esac
`;

export async function getTimers(): Promise<Timer[]> {
  const stored = await read<Timer>(KEY);
  const now = Date.now();
  let changed = false;
  const timers: Timer[] = [];

  for (const timer of stored) {
    if (timer.pausedRemaining !== undefined || isAlive(timer.pid)) {
      timers.push(timer);
      continue;
    }
    changed = true;
    // Process gone: either it finished (drop it) or a logout/reboot killed it (re-arm it).
    if (timer.repeat || timer.endsAt > now) {
      timers.push({ ...timer, pid: spawnAlert(timer) });
    }
  }

  if (changed) await save(timers);
  // Running ones by next alert, paused ones last.
  return timers.sort(
    (a, b) =>
      Number(isPaused(a)) - Number(isPaused(b)) ||
      nextAt(a, now) - nextAt(b, now),
  );
}

/** `input` is what the user typed; it goes into Recent so it can be started again. */
export async function startTimer(
  parsed: Parsed,
  input?: string,
): Promise<Timer> {
  const id = randomUUID();
  const timer: Timer = {
    ...parsed,
    id,
    createdAt: Date.now(),
    pid: spawnAlert({ ...parsed, id }),
  };
  await save([...(await getTimers()), timer]);
  if (input) await addToHistory(input);
  return timer;
}

export async function cancelTimer(timer: Timer): Promise<void> {
  const timers = await read<Timer>(KEY);
  // Drop it from storage before killing it, or a concurrent getTimers() would see a dead
  // repeating timer and re-arm it as if after a reboot.
  await save(timers.filter((t) => t.id !== timer.id));
  stopProcess(timers.find((t) => t.id === timer.id));
}

/** Only one-off countdowns can pause; a clock-time reminder has nothing to pause. */
export function canPause(timer: Timer): boolean {
  return (
    timer.kind === "timer" &&
    !timer.repeat &&
    !isPaused(timer) &&
    !isRinging(timer)
  );
}

export async function pauseTimer(timer: Timer): Promise<void> {
  const running = (await read<Timer>(KEY)).find((t) => t.id === timer.id);
  // Mark it paused before killing it, for the same reason as in cancelTimer.
  await update(timer.id, (t) => ({
    ...t,
    pid: 0,
    pausedRemaining: Math.max(1000, t.endsAt - Date.now()),
  }));
  stopProcess(running);
}

export async function resumeTimer(timer: Timer): Promise<void> {
  await update(timer.id, ({ pausedRemaining, ...t }) => {
    const resumed = { ...t, endsAt: Date.now() + (pausedRemaining ?? 0) };
    return { ...resumed, pid: spawnAlert(resumed) };
  });
}

export function isPaused(timer: Timer): boolean {
  return timer.pausedRemaining !== undefined;
}

/** A one-off timer whose time has passed but whose alert is still sounding or snoozed. */
export function isRinging(timer: Timer, now = Date.now()): boolean {
  return !timer.repeat && !isPaused(timer) && timer.endsAt <= now;
}

export type HistoryEntry = { input: string; lastUsed: number };

export async function getHistory(): Promise<HistoryEntry[]> {
  return read<HistoryEntry>(HISTORY_KEY);
}

export async function removeFromHistory(input: string): Promise<void> {
  const history = await getHistory();
  await write(
    HISTORY_KEY,
    history.filter((h) => h.input !== input),
  );
}

export async function clearHistory(): Promise<void> {
  await LocalStorage.removeItem(HISTORY_KEY);
}

async function addToHistory(input: string) {
  const trimmed = input.trim();
  const rest = (await getHistory()).filter(
    (h) => h.input.toLowerCase() !== trimmed.toLowerCase(),
  );
  await write(
    HISTORY_KEY,
    [{ input: trimmed, lastUsed: Date.now() }, ...rest].slice(0, HISTORY_SIZE),
  );
}

/** What the Ringing command receives when a timer goes off. */
export type RingContext = {
  name: string;
  kind: Parsed["kind"];
  stopFile: string;
};

export function snoozeMinutes(): number {
  const { snoozeMinutes } = getPreferenceValues<Preferences>();
  return Math.max(1, Number(snoozeMinutes) || 5);
}

function spawnAlert(parsed: Parsed & { id: string }): number {
  const { sound } = getPreferenceValues<Preferences>();
  const snooze = snoozeMinutes();
  const context: RingContext = {
    name: parsed.name,
    kind: parsed.kind,
    stopFile: path.join(os.tmpdir(), `raycastini-${parsed.id}.stop`),
  };
  const url = `raycast://extensions/${environment.ownerOrAuthorName}/${environment.extensionName}/ringing?launchContext=${encodeURIComponent(JSON.stringify(context))}`;
  const delay = Math.max(0, Math.round((nextAt(parsed) - Date.now()) / 1000));
  const repeat = !parsed.repeat
    ? ""
    : parsed.repeat.kind === "interval"
      ? String(parsed.repeat.seconds)
      : `daily:${parsed.repeat.time}:${(parsed.repeat.days ?? [1, 2, 3, 4, 5, 6, 7]).join("")}`;

  const child = spawn(
    "/bin/sh",
    [
      "-c",
      ALERT_SCRIPT,
      MARKER,
      String(delay),
      parsed.name,
      parsed.kind === "reminder" ? "Reminder" : "Timer finished",
      repeat,
      sound === "none" ? "" : `/System/Library/Sounds/${sound}.aiff`,
      String(snooze * 60),
      `Snooze ${snooze} min`,
      url,
      context.stopFile,
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  return child.pid!;
}

/** Takes the stored record, whose pid is current even if the caller's copy is stale. */
function stopProcess(timer: Timer | undefined) {
  if (timer && isAlive(timer.pid)) {
    // Negative pid kills the whole detached group: the pending `sleep`, sound loop, snoozes.
    process.kill(-timer.pid);
  }
}

function isAlive(pid: number): boolean {
  if (!pid) return false;
  try {
    const command = execFileSync("/bin/ps", [
      "-p",
      String(pid),
      "-o",
      "command=",
    ]);
    return command.toString().includes(MARKER);
  } catch {
    return false;
  }
}

async function update(id: string, change: (timer: Timer) => Timer) {
  const timers = await read<Timer>(KEY);
  await save(timers.map((t) => (t.id === id ? change(t) : t)));
}

async function read<T>(key: string): Promise<T[]> {
  const raw = await LocalStorage.getItem<string>(key);
  return raw ? JSON.parse(raw) : [];
}

async function write(key: string, value: unknown[]) {
  await LocalStorage.setItem(key, JSON.stringify(value));
}

async function save(timers: Timer[]) {
  await write(KEY, timers);
}
