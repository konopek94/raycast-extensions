import { showHUD } from "@raycast/api";
import { clearTimer, formatTime, getTimer, killTimer } from "./timer";

export default async function Command() {
  const timer = await getTimer();
  await clearTimer();
  if (!timer || timer.at < Date.now() || !killTimer(timer.pid)) {
    await showHUD("No sleep timer running");
    return;
  }
  await showHUD(`Cancelled sleep at ${formatTime(timer.at)}`);
}
