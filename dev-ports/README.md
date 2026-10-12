# Dev Ports

See which dev servers are listening on TCP ports on your Mac, and kill them with one key.

## Commands

- **Dev Ports** — every listening TCP port with its process, PID, project folder and full command line.
  Dev servers (node, bun, python, vite, next, … or anything on ports 3000–9999 outside macOS system paths)
  come first; switch the dropdown to **All** to also see system and app ports. Refreshes every 5 seconds.
- **Kill Port** — type `Kill Port`, Tab, `3000`, Enter. Kills whatever listens there (`:3000` works too).
- **Dev Ports Menu Bar** — number of running dev servers in the menu bar (hidden when 0), each with
  Open in Browser and Kill. Refreshes every 30 seconds.

## Actions in Dev Ports

| Action | Shortcut |
|---|---|
| Kill (SIGTERM) | Enter |
| Force Kill (SIGKILL) | ⌘⇧K |
| Open in Browser (`http://localhost:<port>`) | ⌘O |
| Open Project in VS Code | ⌘⇧O |
| Copy Port | ⌘. |
| Show in Finder, Copy Pid, Copy Command | — |
| Refresh | ⌘R |

After a kill it waits a second and tells you if the process is still running, so you can Force Kill it.

## Notes

- Processes owned by root or other users can't be killed (no sudo); you get a clear error instead.
- Raycast's own extension host is never listed as a dev server, so you can't kill Raycast by accident.
- `adb` (Android, port 5037) shows up as a dev server because of its port.

## How it works

One `lsof -iTCP -sTCP:LISTEN` call lists the ports, then one batched `ps` and one batched `lsof -d cwd`
fill in command lines and working directories. All in `src/ports.ts`, which has no Raycast imports.

## Develop

```sh
npm install
npm run dev
```
