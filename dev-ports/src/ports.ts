import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { basename } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type Listener = {
  port: number;
  pid: number;
  name: string;
  user: string;
  command: string;
  cwd: string;
  isDev: boolean;
};

const DEV_NAMES =
  /^(node|bun|deno|python[\d.]*|ruby|php|java|go|air|uvicorn|gunicorn|rails|puma|hugo|caddy)$/i;
const DEV_COMMAND =
  /\b(vite|next|nuxt|astro|remix|webpack|parcel|esbuild|tsx|ts-node|nodemon|npm|pnpm|yarn|manage\.py|flask|django|go-build)\b/;
// Ports 3000-9999 hint at a dev server unless the binary is a macOS system or app bundle (ControlCenter holds 5000/7000).
const SYSTEM_PATH = /^\/(System|usr\/(libexec|sbin)|Applications)\//;

export async function listListeners(): Promise<Listener[]> {
  // lsof exits 1 when nothing is listening.
  const { stdout } = await run("/usr/sbin/lsof", [
    "-iTCP",
    "-sTCP:LISTEN",
    "-nP",
    "-F",
    "pcnL",
  ]).catch((error) => ({ stdout: String(error.stdout ?? "") }));

  const seen = new Map<string, Omit<Listener, "command" | "cwd" | "isDev">>();
  let pid = 0;
  let name = "";
  let user = "";
  for (const line of stdout.split("\n")) {
    const value = line.slice(1);
    if (line[0] === "p") pid = Number(value);
    else if (line[0] === "c") name = value;
    else if (line[0] === "L") user = value;
    else if (line[0] === "n") {
      // "*:3000", "127.0.0.1:3000", "[::1]:3000" — the port is after the last colon.
      const port = Number(value.slice(value.lastIndexOf(":") + 1));
      if (port) seen.set(`${pid}:${port}`, { port, pid, name, user });
    }
  }

  const pids = [...new Set([...seen.values()].map((l) => l.pid))];
  const [commands, cwds] = await Promise.all([commandsOf(pids), cwdsOf(pids)]);
  return [...seen.values()]
    .map((l) => {
      const command = commands.get(l.pid) ?? l.name;
      return {
        ...l,
        command,
        cwd: cwds.get(l.pid) ?? "",
        isDev: isDev(l.name, l.port, command),
      };
    })
    .sort((a, b) => a.port - b.port);
}

function isDev(name: string, port: number, command: string) {
  if (DEV_NAMES.test(name) || DEV_COMMAND.test(command)) return true;
  return port >= 3000 && port <= 9999 && !SYSTEM_PATH.test(command);
}

async function commandsOf(pids: number[]) {
  const map = new Map<number, string>();
  if (!pids.length) return map;
  const { stdout } = await run("/bin/ps", [
    "-o",
    "pid=,command=",
    "-p",
    pids.join(","),
  ]).catch((error) => ({ stdout: String(error.stdout ?? "") }));
  for (const line of stdout.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (match) map.set(Number(match[1]), match[2].trim());
  }
  return map;
}

async function cwdsOf(pids: number[]) {
  const map = new Map<number, string>();
  if (!pids.length) return map;
  // Other users' processes are skipped silently; lsof then exits 1 but still prints ours.
  const { stdout } = await run("/usr/sbin/lsof", [
    "-a",
    "-p",
    pids.join(","),
    "-d",
    "cwd",
    "-Fn",
  ]).catch((error) => ({ stdout: String(error.stdout ?? "") }));
  let pid = 0;
  for (const line of stdout.split("\n")) {
    if (line[0] === "p") pid = Number(line.slice(1));
    else if (line[0] === "n") map.set(pid, line.slice(1));
  }
  return map;
}

export function projectName(cwd: string) {
  return cwd && cwd !== "/" ? basename(cwd) : "";
}

export function tildify(path: string) {
  const home = homedir();
  return path.startsWith(home) ? "~" + path.slice(home.length) : path;
}

export function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Sends the signal; throws a readable Error on failure (e.g. a root-owned process). */
export function killProcess(pid: number, signal: "SIGTERM" | "SIGKILL") {
  try {
    process.kill(pid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM")
      throw new Error(
        `No permission to kill pid ${pid} (owned by another user)`,
      );
    if (code === "ESRCH") throw new Error(`Process ${pid} is already gone`);
    throw error;
  }
}

/** Resolves true once the process is gone, false if it's still alive after `ms`. */
export async function waitForExit(pid: number, ms = 1000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isAlive(pid);
}

export async function openInVSCode(cwd: string) {
  await run("/usr/bin/open", ["-a", "Visual Studio Code", cwd]);
}
