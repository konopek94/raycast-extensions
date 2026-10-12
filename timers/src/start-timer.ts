import {
  LaunchProps,
  LaunchType,
  launchCommand,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { describeRepeat, formatClock, parse } from "./parse";
import { startTimer } from "./timers";

export default async function Command(
  props: LaunchProps<{ arguments: Arguments.StartTimer }>,
) {
  const parsed = parse(props.arguments.input);
  if (!parsed) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Couldn't read that",
      message:
        'Try "25m tea", "tomorrow 10am dentist" or "weekdays 9am standup"',
    });
    return;
  }

  await startTimer(parsed, props.arguments.input);
  // Refresh the menu bar right away instead of waiting for its next tick.
  await launchCommand({ name: "menu-bar", type: LaunchType.Background }).catch(
    () => {},
  );
  const when = parsed.repeat
    ? describeRepeat(parsed.repeat)
    : formatClock(parsed.endsAt);
  await showHUD(`⏱ ${parsed.name} — ${when}`);
}
