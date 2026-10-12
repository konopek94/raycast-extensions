import { Icon, LaunchType, MenuBarExtra, launchCommand } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import {
  describeRepeat,
  formatClock,
  formatRemaining,
  nextAt,
  parse,
} from "./parse";
import { getPresets } from "./presets";
import {
  canPause,
  cancelTimer,
  getHistory,
  getTimers,
  isPaused,
  isRinging,
  pauseTimer,
  resumeTimer,
  startTimer,
  type Timer,
} from "./timers";

export default function Command() {
  const timers = usePromise(getTimers);
  const history = usePromise(getHistory);
  // Sorted with paused ones last, so the first is the next to go off if any is running.
  const next = timers.data?.[0];

  async function run(action: () => Promise<unknown>) {
    await action();
    timers.revalidate();
    history.revalidate();
  }

  return (
    <MenuBarExtra
      isLoading={timers.isLoading || history.isLoading}
      icon={Icon.Clock}
      // Background refresh is at most every 10s, so show minutes rather than a ticking clock.
      title={next ? `${next.name} ${titleTime(next)}` : undefined}
    >
      {timers.data?.map((timer) => (
        <MenuBarExtra.Section key={timer.id} title={sectionTitle(timer)}>
          {isPaused(timer) && (
            <MenuBarExtra.Item
              title="Resume"
              icon={Icon.Play}
              onAction={() => run(() => resumeTimer(timer))}
            />
          )}
          {canPause(timer) && (
            <MenuBarExtra.Item
              title="Pause"
              icon={Icon.Pause}
              onAction={() => run(() => pauseTimer(timer))}
            />
          )}
          <MenuBarExtra.Item
            title={isRinging(timer) ? "Stop" : "Cancel"}
            icon={Icon.XMarkCircle}
            onAction={() => run(() => cancelTimer(timer))}
          />
        </MenuBarExtra.Section>
      ))}
      <MenuBarExtra.Section title="Quick Start">
        {getPresets().map(({ label, parsed }) => (
          <MenuBarExtra.Item
            key={label}
            title={label}
            icon={Icon.Bolt}
            onAction={() => run(() => startTimer(parsed, label))}
          />
        ))}
        {history.data?.length ? (
          <MenuBarExtra.Submenu title="Recent" icon={Icon.Clock}>
            {history.data.slice(0, 8).map(({ input }) => (
              <MenuBarExtra.Item
                key={input}
                title={input}
                onAction={() => {
                  const again = parse(input);
                  if (again) return run(() => startTimer(again, input));
                }}
              />
            ))}
          </MenuBarExtra.Submenu>
        ) : null}
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

function sectionTitle(timer: Timer): string {
  if (isPaused(timer)) {
    return `${timer.name} — paused, ${formatRemaining(timer.pausedRemaining!)} left`;
  }
  const when = timer.repeat
    ? describeRepeat(timer.repeat)
    : formatClock(timer.endsAt);
  return `${timer.name} — ${when}`;
}

function titleTime(timer: Timer): string {
  if (isPaused(timer)) return "⏸";
  if (isRinging(timer)) return "⏰";
  const minutes = Math.ceil((nextAt(timer) - Date.now()) / 60000);
  if (minutes >= 24 * 60) return formatClock(nextAt(timer));
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}
