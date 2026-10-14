import { LaunchProps, showHUD, showToast, Toast } from "@raycast/api";
import { spawn } from "child_process";
import { clearTimer, formatTime, getTimer, killTimer, setTimer } from "./timer";

// "30" → in 30 minutes; "23:15" → next 23:15 (tomorrow if already past).
function parseWhen(input: string): number | undefined {
  const now = Date.now();
  const minutes = input.match(/^(\d+)\s*m?$/);
  if (minutes) return now + Number(minutes[1]) * 60_000;

  const time = input.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!time) return undefined;
  const [h, m] = [Number(time[1]), Number(time[2])];
  if (h > 23 || m > 59) return undefined;
  const at = new Date();
  at.setHours(h, m, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return at.getTime();
}

export default async function Command(
  props: LaunchProps<{ arguments: Arguments.SleepIn }>,
) {
  const at = parseWhen(props.arguments.when.trim());
  if (!at) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Use minutes (30) or a time (23:15)",
    });
    return;
  }

  const previous = await getTimer();
  if (previous) killTimer(previous.pid);
  await clearTimer();

  const seconds = Math.max(1, Math.round((at - Date.now()) / 1000));
  // Detached so it outlives the Raycast command; its own process group so cancel can kill both sh and sleep.
  const child = spawn(
    "/bin/sh",
    ["-c", `sleep ${seconds} && /usr/bin/pmset sleepnow`],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  if (!child.pid) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Couldn't start sleep timer",
    });
    return;
  }

  await setTimer({ pid: child.pid, at });
  await showHUD(`Sleeping at ${formatTime(at)}`);
}
