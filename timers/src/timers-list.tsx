import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useEffect, useState } from "react";
import {
  describeRepeat,
  formatClock,
  formatRemaining,
  nextAt,
  parse,
  type Parsed,
} from "./parse";
import { getPresets } from "./presets";
import {
  canPause,
  cancelTimer,
  clearHistory,
  getHistory,
  getTimers,
  isPaused,
  isRinging,
  pauseTimer,
  removeFromHistory,
  resumeTimer,
  startTimer,
  type Timer,
} from "./timers";

export default function Command() {
  const timers = usePromise(getTimers);
  const history = usePromise(getHistory);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const parsed = parse(search);

  async function start(item: Parsed, input: string) {
    await startTimer(item, input);
    setSearch("");
    timers.revalidate();
    history.revalidate();
    await showToast({ title: `Started ${item.name}` });
  }

  async function act(action: () => Promise<void>, title: string) {
    await action();
    timers.revalidate();
    await showToast({ style: Toast.Style.Success, title });
  }

  return (
    <List
      isLoading={timers.isLoading}
      searchText={search}
      onSearchTextChange={setSearch}
      searchBarPlaceholder='New: "25m tea", "tomorrow 10am dentist", "weekdays 9am standup"'
      filtering={false}
    >
      {parsed && (
        <List.Section title="New">
          <List.Item
            icon={{ source: iconFor(parsed), tintColor: Color.Green }}
            title={`Start ${parsed.repeat ? "repeating " : ""}${parsed.kind}: ${parsed.name}`}
            subtitle={whenText(parsed, now)}
            actions={
              <ActionPanel>
                <Action
                  title="Start"
                  icon={Icon.Play}
                  onAction={() => start(parsed, search)}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      <List.Section title="Running">
        {timers.data?.map((timer) => (
          <List.Item
            key={timer.id}
            icon={isPaused(timer) ? Icon.Pause : iconFor(timer)}
            title={timer.name}
            subtitle={subtitleFor(timer, now)}
            accessories={accessoriesFor(timer, now)}
            actions={
              <ActionPanel>
                {isPaused(timer) ? (
                  <Action
                    title="Resume"
                    icon={Icon.Play}
                    onAction={() =>
                      act(() => resumeTimer(timer), `Resumed ${timer.name}`)
                    }
                  />
                ) : (
                  canPause(timer) && (
                    <Action
                      title="Pause"
                      icon={Icon.Pause}
                      onAction={() =>
                        act(() => pauseTimer(timer), `Paused ${timer.name}`)
                      }
                    />
                  )
                )}
                <Action
                  title={isRinging(timer, now) ? "Stop" : "Cancel"}
                  icon={Icon.XMarkCircle}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={() =>
                    act(() => cancelTimer(timer), `Cancelled ${timer.name}`)
                  }
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      {!search && (
        <List.Section title="Recent">
          {history.data?.map(({ input }) => {
            const again = parse(input);
            if (!again) return null;
            return (
              <List.Item
                key={input}
                icon={Icon.Clock}
                title={input}
                subtitle={whenText(again, now)}
                actions={
                  <ActionPanel>
                    <Action
                      title="Start Again"
                      icon={Icon.RotateClockwise}
                      onAction={() => start(again, input)}
                    />
                    <Action
                      title="Remove from Recent"
                      icon={Icon.Trash}
                      shortcut={{ modifiers: ["ctrl"], key: "x" }}
                      onAction={async () => {
                        await removeFromHistory(input);
                        history.revalidate();
                      }}
                    />
                    <Action
                      title="Clear Recent"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
                      onAction={async () => {
                        await clearHistory();
                        history.revalidate();
                      }}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
      {!search && (
        <List.Section title="Quick Start">
          {getPresets().map(({ label, parsed: preset }) => (
            <List.Item
              key={label}
              icon={Icon.Bolt}
              title={label}
              actions={
                <ActionPanel>
                  <Action
                    title="Start"
                    icon={Icon.Play}
                    onAction={() => start(preset, label)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
      {search && !parsed && (
        <List.EmptyView
          icon={Icon.QuestionMarkCircle}
          title="Couldn't read that"
          description='Try "25m tea", "at 17:00 call mom", "tomorrow 10am dentist", "every 1h stretch" or "weekdays 9am standup"'
        />
      )}
    </List>
  );
}

function iconFor(item: Parsed) {
  if (item.repeat) return Icon.Repeat;
  return item.kind === "reminder" ? Icon.Bell : Icon.Clock;
}

function whenText(item: Parsed, now: number) {
  if (item.repeat) return describeRepeat(item.repeat);
  return item.kind === "reminder"
    ? formatClock(item.endsAt, now)
    : formatRemaining(item.endsAt - now);
}

function subtitleFor(timer: Timer, now: number) {
  if (isPaused(timer)) return formatRemaining(timer.pausedRemaining!);
  if (isRinging(timer, now)) return undefined;
  return formatRemaining(nextAt(timer, now) - now);
}

function accessoriesFor(timer: Timer, now: number): List.Item.Accessory[] {
  if (isPaused(timer)) {
    return [{ tag: { value: "Paused", color: Color.Yellow } }];
  }
  const when = { text: formatClock(nextAt(timer, now), now), icon: Icon.Alarm };
  if (isRinging(timer, now)) {
    return [{ tag: { value: "Ringing / snoozed", color: Color.Red } }, when];
  }
  if (timer.repeat) {
    return [{ tag: describeRepeat(timer.repeat), icon: Icon.Repeat }, when];
  }
  return [when];
}
