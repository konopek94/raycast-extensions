# Raycastini Timers

Timers and reminders for Raycast, typed the way you'd say them.

## Commands

- **Start Timer** — type `Start Timer`, Tab, then e.g. `25m tea`, Enter.
- **Timers** — live list of what's running: pause/resume countdowns, cancel (⌃X). Type in the search bar to start a new one, or pick from Recent and Quick Start.
- **Timers Menu Bar** — the next timer in the menu bar, with pause/resume, cancel, presets and Recent.
- **Ringing Timer** — opens by itself when something goes off. You don't run it directly.

## What you can type

| Input | Result |
|---|---|
| `25m tea`, `1h30 laundry`, `90s`, `25 pasta`, `in 2h stretch` | Timer |
| `at 17:00 call mom`, `5pm standup`, `at 9 gym` | Reminder (tomorrow if the time has passed) |
| `every 30m drink water`, `every 1h stretch` | Repeating timer |
| `tomorrow 10am dentist`, `fri 18:00 call dad`, `tmrw dentist` (9:00) | Reminder on a given day |
| `every day at 9 standup`, `daily 9:30am meds` | Daily reminder |
| `weekdays 9am standup`, `weekends 10:00 run`, `every mon, wed 18:00 gym` | Reminder on chosen weekdays |

When it goes off, Raycast opens on a **Ringing** screen and the sound repeats until you press **Enter** (Done) or **⌘S** (snooze). If Raycast can't be opened, a system dialog with Snooze/Done is shown instead.

## Preferences

- **Alert Sound** — any macOS system sound, or none
- **Snooze Minutes** — default 5
- **Presets** — comma-separated, default `5m, 15m, 25m focus, 1h`

## How it works

Each timer is a detached `/bin/sh` process (`sleep` → opens the Ringing command via deeplink + looping `afplay`), so alerts fire
even when Raycast has unloaded the extension. Timers are stored in Raycast LocalStorage; whenever the
list or menu bar loads, any timer whose process died (logout, reboot) is re-armed. A one-off reminder
whose time passed while the Mac was off is dropped silently.

Note: a name that starts with a day word is read as that day — `sun salutation` becomes a Sunday 9:00 reminder.

## Develop

```sh
npm install
npm run dev
```

## Publish to the Raycast Store

1. Set `"author"` in `package.json` to your Raycast username (raycast.com → Settings → Account).
2. `npm run lint` must pass.
3. `npm run publish` — logs in with GitHub and opens a PR to `raycast/extensions`.
