import { Icon, LaunchType, MenuBarExtra, launchCommand } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { describeRepeat, formatClock, nextAt } from "./parse";
import { getPresets } from "./presets";
import { cancelTimer, getTimers, isRinging, startTimer } from "./timers";

export default function Command() {
  const { data: timers, isLoading, revalidate } = usePromise(getTimers);
  const next = timers?.[0];

  return (
    <MenuBarExtra
      isLoading={isLoading}
      icon={Icon.Clock}
      // Background refresh is at most every 10s, so show minutes rather than a ticking clock.
      title={next ? `${next.name} ${titleTime(next)}` : undefined}
    >
      {timers?.map((timer) => (
        <MenuBarExtra.Section
          key={timer.id}
          title={`${timer.name} — ${timer.repeat ? describeRepeat(timer.repeat) : formatClock(timer.endsAt)}`}
        >
          <MenuBarExtra.Item
            title={isRinging(timer) ? "Stop" : "Cancel"}
            icon={Icon.XMarkCircle}
            onAction={async () => {
              await cancelTimer(timer);
              revalidate();
            }}
          />
        </MenuBarExtra.Section>
      ))}
      <MenuBarExtra.Section title="Quick Start">
        {getPresets().map(({ label, parsed }) => (
          <MenuBarExtra.Item
            key={label}
            title={label}
            icon={Icon.Bolt}
            onAction={async () => {
              await startTimer(parsed);
              revalidate();
            }}
          />
        ))}
        <MenuBarExtra.Item
          title="New Timer…"
          icon={Icon.Plus}
          onAction={() =>
            launchCommand({
              name: "timers-list",
              type: LaunchType.UserInitiated,
            })
          }
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

function titleTime(timer: Parameters<typeof isRinging>[0]): string {
  if (isRinging(timer)) return "⏰";
  const minutes = Math.ceil((nextAt(timer) - Date.now()) / 60000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}
