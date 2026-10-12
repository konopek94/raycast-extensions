# Raycastini Timers

Timers and reminders for Raycast, typed the way you'd say them.

## Commands

- **Start Timer** — type `Start Timer`, Tab, then e.g. `25m tea`, Enter.
- **Timers** — live list of what's running; type in the search bar to start a new one, or pick a Quick Start preset.
- **Timers Menu Bar** — the next timer in the menu bar, with Cancel and presets.

## What you can type

| Input | Result |
|---|---|
| `25m tea`, `1h30 laundry`, `90s`, `25 pasta`, `in 2h stretch` | Timer |
| `at 17:00 call mom`, `5pm standup`, `at 9 gym` | Reminder (tomorrow if the time has passed) |
| `every 30m drink water`, `every 1h stretch` | Repeating timer |
| `every day at 9 standup`, `daily 9:30am meds` | Daily reminder |

When it goes off you get a sound and a dialog with **Snooze** and **Done**.

## Preferences

- **Alert Sound** — any macOS system sound, or none
- **Snooze Minutes** — default 5
- **Presets** — comma-separated, default `5m, 15m, 25m focus, 1h`

## How it works

Each timer is a detached `/bin/sh` process (`sleep` → `afplay` + `osascript` dialog), so alerts fire
even when Raycast has unloaded the extension. Timers are stored in Raycast LocalStorage; whenever the
list or menu bar loads, any timer whose process died (logout, reboot) is re-armed. A one-off reminder
whose time passed while the Mac was off is dropped silently.

## Develop

```sh
npm install
npm run dev
```
