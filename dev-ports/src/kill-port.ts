import { LaunchProps, showHUD, showToast, Toast } from "@raycast/api";
import { killProcess, listListeners } from "./ports";

export default async function Command(
  props: LaunchProps<{ arguments: Arguments.KillPort }>,
) {
  const port = Number(props.arguments.port.trim().replace(/^:/, ""));
  const matches = (await listListeners()).filter((l) => l.port === port);
  if (!port || !matches.length) {
    await showToast({
      style: Toast.Style.Failure,
      title: `Nothing on :${props.arguments.port.trim()}`,
    });
    return;
  }

  try {
    for (const l of matches) killProcess(l.pid, "SIGTERM");
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: `Couldn't kill :${port}`,
      message: (error as Error).message,
    });
    return;
  }
  const names = matches.map((l) => `${l.name} (pid ${l.pid})`).join(", ");
  await showHUD(`Killed ${names} on :${port}`);
}
