import { Icon, MenuBarExtra, open, showHUD } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { killProcess, listListeners, projectName } from "./ports";

export default function Command() {
  const { data, isLoading, revalidate } = usePromise(listListeners);
  const dev = data?.filter((l) => l.isDev) ?? [];

  return (
    <MenuBarExtra
      isLoading={isLoading}
      icon={Icon.Network}
      title={dev.length ? String(dev.length) : undefined}
      tooltip="Dev servers"
    >
      {!isLoading && !dev.length && (
        <MenuBarExtra.Item title="No dev servers listening" />
      )}
      {dev.map((l) => {
        const project = projectName(l.cwd);
        return (
          <MenuBarExtra.Submenu
            key={`${l.pid}:${l.port}`}
            title={`:${l.port} ${l.name}${project ? ` — ${project}` : ""}`}
          >
            <MenuBarExtra.Item
              title="Open in Browser"
              icon={Icon.Globe}
              onAction={() => open(`http://localhost:${l.port}`)}
            />
            <MenuBarExtra.Item
              title="Kill"
              icon={Icon.XMarkCircle}
              onAction={async () => {
                try {
                  killProcess(l.pid, "SIGTERM");
                  await showHUD(
                    `Killed ${l.name} (pid ${l.pid}) on :${l.port}`,
                  );
                } catch (error) {
                  await showHUD((error as Error).message);
                }
                revalidate();
              }}
            />
          </MenuBarExtra.Submenu>
        );
      })}
    </MenuBarExtra>
  );
}
