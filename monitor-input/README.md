# Monitor Input

Switch an external monitor between your Mac and a console (Xbox) with one hotkey.

## Commands

- **Toggle Monitor Input** — if the monitor shows the Mac, switches it to the console's HDMI port and
  mirrors the monitor onto the laptop screen, so macOS has one desktop and your windows stay on the
  laptop. Run it again to restore your display layout and switch the monitor back to the Mac.

Give it a hotkey in Raycast Settings → Extensions.

## Preferences

| Preference | Default | Meaning |
|---|---|---|
| Mac Input | `15` | DDC input code of the Mac's port (USB-C usually reports 15) |
| Xbox Input | HDMI 1 (`17`) | Port the console is plugged into (HDMI 2 is `18`) |

To find your Mac's code, run `m1ddc get input` while the monitor shows the Mac.

## Requirements

```sh
brew install m1ddc displayplacer
```

Apple Silicon Mac, monitor with DDC/CI enabled.

## How it works

`m1ddc` reads and sets the monitor's input over DDC. `displayplacer` mirrors the external screen onto the
built-in one; the layout from before the switch is saved in Raycast and restored on the way back.

## Develop

```sh
npm install
npm run dev
```
