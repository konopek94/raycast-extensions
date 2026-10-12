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
import { cancelTimer, getTimers, isRinging, startTimer } from "./timers";

export default function Command() {
  const { data: timers, isLoading, revalidate } = usePromise(getTimers);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const parsed = parse(search);

  async function start(item: Parsed) {
    await startTimer(item);
    setSearch("");
    revalidate();
    await showToast({ title: `Started ${item.name}` });
  }

  return (
    <List
      isLoading={isLoading}
      searchText={search}
      onSearchTextChange={setSearch}
      searchBarPlaceholder='New: "25m tea", "at 17:00 call mom", "every 1h stretch"'
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
                  onAction={() => start(parsed)}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      <List.Section title="Running">
        {timers?.map((timer) => {
          const ringing = isRinging(timer, now);
          return (
            <List.Item
              key={timer.id}
              icon={iconFor(timer)}
              title={timer.name}
              subtitle={
                ringing ? undefined : formatRemaining(nextAt(timer, now) - now)
              }
              accessories={[
                ringing
                  ? { tag: { value: "Ringing / snoozed", color: Color.Red } }
                  : timer.repeat
                    ? {
                        tag: describeRepeat(timer.repeat),
                        icon: Icon.Repeat,
                      }
                    : {},
                { text: formatClock(nextAt(timer, now)), icon: Icon.Alarm },
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title={ringing ? "Stop" : "Cancel"}
                    icon={Icon.XMarkCircle}
                    style={Action.Style.Destructive}
                    onAction={async () => {
                      await cancelTimer(timer);
                      revalidate();
                      await showToast({
                        style: Toast.Style.Success,
                        title: `Cancelled ${timer.name}`,
                      });
                    }}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
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
                    onAction={() => start(preset)}
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
          description='Try "25m tea", "1h30 laundry", "at 17:00 call mom" or "every 1h stretch"'
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
    ? `at ${formatClock(item.endsAt)}`
    : formatRemaining(item.endsAt - now);
}
