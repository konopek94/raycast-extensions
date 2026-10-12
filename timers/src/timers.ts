import { environment, getPreferenceValues, LocalStorage } from "@raycast/api";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { nextAt, type Parsed } from "./parse";

export type Timer = Parsed & { id: string; createdAt: number; pid: number };

const KEY = "timers";
// Passed as the shell's $0 so `ps` can tell our alert processes from a reused pid.
const MARKER = "raycastini-timer";

// Runs detached so it fires even after Raycast unloads the extension.
// User text arrives as positional arguments, never interpolated into the script.
// Args: delay, name, title, repeat ("" | seconds | daily:HH:MM), sound path, snooze seconds,
// snooze label, Raycast deeplink to the Ringing command, stop file
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
  const id = randomUUID();
  const timer: Timer = {
    ...parsed,
    id,
    createdAt: Date.now(),
    pid: spawnAlert({ ...parsed, id }),
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

/** A one-off timer whose time has passed but whose alert is still sounding or snoozed. */
export function isRinging(timer: Timer, now = Date.now()): boolean {
  return !timer.repeat && timer.endsAt <= now;
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
      url,
      context.stopFile,
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
