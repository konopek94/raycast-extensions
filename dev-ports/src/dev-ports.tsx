import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  Toast,
  showToast,
} from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useEffect, useState } from "react";
import {
  type Listener,
  killProcess,
  listListeners,
  openInVSCode,
  projectName,
  tildify,
  waitForExit,
} from "./ports";

export default function Command() {
  const [filter, setFilter] = useState("dev");
  const { data, isLoading, revalidate } = usePromise(listListeners);

  useEffect(() => {
    const timer = setInterval(revalidate, 5000);
    return () => clearInterval(timer);
  }, []);

  async function kill(l: Listener, signal: "SIGTERM" | "SIGKILL") {
    const label = `${l.name} (pid ${l.pid}) on :${l.port}`;
    try {
      killProcess(l.pid, signal);
    } catch (error) {
      await showFailureToast(error, { title: `Couldn't kill ${label}` });
      return;
    }
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Killing ${label}`,
    });
    if (await waitForExit(l.pid)) {
      toast.style = Toast.Style.Success;
      toast.title = `Killed ${label}`;
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = `${label} is still running`;
      toast.message = "Try Force Kill (⌘⇧K)";
    }
    revalidate();
  }

  const dev = data?.filter((l) => l.isDev) ?? [];
  const other = data?.filter((l) => !l.isDev) ?? [];

  function item(l: Listener) {
    const project = projectName(l.cwd);
    return (
      <List.Item
        key={`${l.pid}:${l.port}`}
        icon={{
          source: l.isDev ? Icon.Terminal : Icon.Cog,
          tintColor: l.isDev ? Color.Green : Color.SecondaryText,
        }}
        title={`:${l.port}`}
        subtitle={project ? `${l.name} — ${project}` : l.name}
        keywords={[l.name, project, String(l.pid)]}
        accessories={[{ text: `pid ${l.pid}` }]}
        detail={
          <List.Item.Detail
            metadata={
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.Label
                  title="Port"
                  text={String(l.port)}
                />
                <List.Item.Detail.Metadata.Label
                  title="Process"
                  text={l.name}
                />
                <List.Item.Detail.Metadata.Label
                  title="PID"
                  text={String(l.pid)}
                />
                <List.Item.Detail.Metadata.Label title="User" text={l.user} />
                <List.Item.Detail.Metadata.Label
                  title="Directory"
                  text={l.cwd ? tildify(l.cwd) : "unknown"}
                />
                <List.Item.Detail.Metadata.Separator />
                <List.Item.Detail.Metadata.Label
                  title="Command"
                  text={l.command}
                />
              </List.Item.Detail.Metadata>
            }
          />
        }
        actions={
          <ActionPanel>
            <Action
              title="Kill"
              icon={Icon.XMarkCircle}
              style={Action.Style.Destructive}
              onAction={() => kill(l, "SIGTERM")}
            />
            <Action
              title="Force Kill"
              icon={Icon.XMarkCircleFilled}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd", "shift"], key: "k" }}
              onAction={() => kill(l, "SIGKILL")}
            />
            <Action.OpenInBrowser
              url={`http://localhost:${l.port}`}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
            />
            {project && (
              <>
                <Action
                  title="Open Project in VS Code"
                  icon={Icon.Code}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                  onAction={() =>
                    openInVSCode(l.cwd).catch((error) =>
                      showFailureToast(error, {
                        title: "Couldn't open VS Code",
                      }),
                    )
                  }
                />
                <Action.ShowInFinder path={l.cwd} />
              </>
            )}
            <ActionPanel.Section>
              <Action.CopyToClipboard
                title="Copy Port"
                content={String(l.port)}
                shortcut={{ modifiers: ["cmd"], key: "." }}
              />
              <Action.CopyToClipboard
                title="Copy Pid"
                content={String(l.pid)}
              />
              <Action.CopyToClipboard
                title="Copy Command"
                content={l.command}
              />
            </ActionPanel.Section>
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onAction={revalidate}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Filter by port, process or project"
      searchBarAccessory={
        <List.Dropdown tooltip="Show" value={filter} onChange={setFilter}>
          <List.Dropdown.Item title="Dev Servers" value="dev" />
          <List.Dropdown.Item title="All" value="all" />
        </List.Dropdown>
      }
    >
      <List.EmptyView
        icon={Icon.Network}
        title="No dev servers listening"
        description="Switch to All to see every listening port"
      />
      <List.Section title="Dev Servers">{dev.map(item)}</List.Section>
      {filter === "all" && (
        <List.Section title="Other">{other.map(item)}</List.Section>
      )}
    </List>
  );
}
