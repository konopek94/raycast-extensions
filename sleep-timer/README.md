# Sleep Timer

Put your Mac to sleep in N minutes or at a specific time.

## Commands

- **Sleep In** — type `Sleep In`, Tab, then minutes (`30`) or a time (`23:15`), Enter. A time that has
  already passed today means tomorrow. Starting a new timer replaces the running one.
- **Cancel Sleep Timer** — cancels the scheduled sleep.

## Notes

- No password needed: it uses `pmset sleepnow`, which any user can run.
- The countdown is a detached `sleep N && pmset sleepnow` shell, so it keeps running after Raycast closes
  the command. If the Mac sleeps on its own before then, the countdown pauses with it.

## Develop

```sh
npm install
npm run dev
```
