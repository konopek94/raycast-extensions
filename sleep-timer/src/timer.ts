import { LocalStorage } from "@raycast/api";

const KEY = "timer";

export type Timer = { pid: number; at: number };

export async function getTimer(): Promise<Timer | undefined> {
  const raw = await LocalStorage.getItem<string>(KEY);
  return raw ? JSON.parse(raw) : undefined;
}

export async function setTimer(timer: Timer) {
  await LocalStorage.setItem(KEY, JSON.stringify(timer));
}

export async function clearTimer() {
  await LocalStorage.removeItem(KEY);
}

// Kills the pending `sleep && pmset` shell; returns false if it already ran.
export function killTimer(pid: number): boolean {
  try {
    process.kill(-pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
