import {
  Action,
  ActionPanel,
  closeMainWindow,
  Detail,
  Icon,
  LaunchProps,
  LaunchType,
  launchCommand,
  showHUD,
} from "@raycast/api";
import { writeFileSync } from "node:fs";
import { useEffect } from "react";
import { formatClock } from "./parse";
import { type RingContext, snoozeMinutes, startTimer } from "./timers";

export default function Command(
  props: LaunchProps<{ launchContext?: RingContext }>,
) {
  const ring = props.launchContext;

  // Closing the window any way (Esc included) silences the alarm.
  useEffect(() => () => ring && stopSound(ring), [ring]);

  if (!ring) {
    return (
      <Detail markdown="# Nothing is ringing\n\nThis screen opens by itself when a timer or reminder goes off." />
    );
  }

  const snooze = snoozeMinutes();

  async function done() {
    stopSound(ring!);
    await closeMainWindow({ clearRootSearch: true });
  }

  async function snoozeFor(minutes: number) {
    stopSound(ring!);
    const endsAt = Date.now() + minutes * 60_000;
    await startTimer({ name: ring!.name, kind: ring!.kind, endsAt });
    await launchCommand({
      name: "menu-bar",
      type: LaunchType.Background,
    }).catch(() => {});
    await showHUD(`💤 ${ring!.name} — ${formatClock(endsAt)}`);
  }

  const heading = ring.kind === "reminder" ? "🔔 Reminder" : "⏰ Time's up";

  return (
    <Detail
      navigationTitle={heading}
      markdown={`# ${heading}\n\n## ${ring.name}\n\nPress **Enter** to dismiss, **⌘S** to snooze ${snooze} min.`}
      actions={
        <ActionPanel>
          <Action title="Done" icon={Icon.CheckCircle} onAction={done} />
          <Action
            title={`Snooze ${snooze} Min`}
            icon={Icon.Moon}
            shortcut={{ modifiers: ["cmd"], key: "s" }}
            onAction={() => snoozeFor(snooze)}
          />
          <Action
            title="Snooze 15 Min"
            icon={Icon.Moon}
            shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
            onAction={() => snoozeFor(15)}
          />
        </ActionPanel>
      }
    />
  );
}

function stopSound(ring: RingContext) {
  try {
    writeFileSync(ring.stopFile, "");
  } catch {
    // tmp dir unwritable — the sound loop still stops on its own after ~1 min.
  }
}
