import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { nextAt, type Parsed } from "./parse";

export type Timer = Parsed & { id: string; createdAt: number; pid: number };

const KEY = "timers";
// Passed as the shell's $0 so `ps` can tell our alert processes from a reused pid.
const MARKER = "raycastini-timer";

// Runs detached so it fires even after Raycast unloads the extension.
// User text arrives as positional arguments, never interpolated into the script.
// Args: delay, name, title, repeat ("" | seconds | daily:HH:MM), sound path, snooze seconds, snooze label
const ALERT_SCRIPT = `
NAME=$2 TITLE=$3 REPEAT=$4 SOUND=$5 SNOOZE=$6 SNOOZE_LABEL=$7
alert() {
  if [ -n "$SOUND" ]; then afplay "$SOUND" & fi
  btn=$(osascript -e 'on run argv' -e 'display dialog (item 1 of argv) with title (item 2 of argv) buttons {item 3 of argv, "Done"} default button "Done" with icon note' -e 'end run' "$NAME" "$TITLE" "$SNOOZE_LABEL")
  case "$btn" in *"$SNOOZE_LABEL"*) sleep "$SNOOZE"; alert ;; esac
}
sleep "$1"
case "$REPEAT" in
  "") alert ;;
  daily:*)
    while :; do
      alert &
      sleep 60
      now=$(date +%s)
      t=$(date -j -f %H:%M:%S "\${REPEAT#daily:}:00" +%s)
      [ "$t" -le "$now" ] && t=$((t + 86400))
      sleep $((t - now))
    done ;;
  *) while :; do alert & sleep "$REPEAT"; done ;;
esac
`;

export async function getTimers(): Promise<Timer[]> {
  const raw = await LocalStorage.getItem<string>(KEY);
  const stored: Timer[] = raw ? JSON.parse(raw) : [];
  const now = Date.now();
  let changed = false;
  const timers: Timer[] = [];

  for (const timer of stored) {
    if (isAlive(timer.pid)) {
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
  return timers.sort((a, b) => nextAt(a, now) - nextAt(b, now));
}

export async function startTimer(parsed: Parsed): Promise<Timer> {
  const timer: Timer = {
    ...parsed,
    id: randomUUID(),
    createdAt: Date.now(),
    pid: spawnAlert(parsed),
  };
  await save([...(await getTimers()), timer]);
  return timer;
}

export async function cancelTimer(timer: Timer): Promise<void> {
  if (isAlive(timer.pid)) {
    // Negative pid kills the whole detached group: the pending `sleep`, open dialogs, snoozes.
    process.kill(-timer.pid);
  }
  await save((await getTimers()).filter((t) => t.id !== timer.id));
}

/** A one-off timer whose time has passed but whose alert is still open or snoozed. */
export function isRinging(timer: Timer, now = Date.now()): boolean {
  return !timer.repeat && timer.endsAt <= now;
}

function spawnAlert(parsed: Parsed): number {
  const { sound, snoozeMinutes } = getPreferenceValues<Preferences>();
  const snooze = Math.max(1, Number(snoozeMinutes) || 5);
  const delay = Math.max(0, Math.round((nextAt(parsed) - Date.now()) / 1000));
  const repeat = !parsed.repeat
    ? ""
    : parsed.repeat.kind === "interval"
      ? String(parsed.repeat.seconds)
      : `daily:${parsed.repeat.time}`;

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
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  return child.pid!;
}

function isAlive(pid: number): boolean {
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

async function save(timers: Timer[]) {
  await LocalStorage.setItem(KEY, JSON.stringify(timers));
}
