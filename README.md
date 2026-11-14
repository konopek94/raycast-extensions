# Raycast extensions

Small [Raycast](https://www.raycast.com/) extensions I wrote for my own Mac and use every day. Each folder is a standalone extension with its own README.

| Extension | What it does |
|---|---|
| [dev-ports](dev-ports/) | Lists dev servers listening on TCP ports, with their process and project folder, and kills them with one key. Includes a menu bar counter. |
| [timers](timers/) | Timers and reminders typed the way you'd say them: `25m tea`, `fri 18:00 call dad`, `weekdays 9am standup`. |
| [sleep-timer](sleep-timer/) | Puts the Mac to sleep in N minutes or at a specific time. |
| [monitor-input](monitor-input/) | Switches an external monitor between the Mac and a console over DDC, and restores the display layout on the way back. |

## Run one

```sh
cd dev-ports
npm install
npm run dev
```

`npm run dev` loads the extension into Raycast in development mode. The extensions are not in the Raycast Store.

## License

MIT
