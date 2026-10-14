import {
  getPreferenceValues,
  LocalStorage,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { execFileSync } from "child_process";

// Raycast's PATH doesn't include Homebrew.
const M1DDC = "/opt/homebrew/bin/m1ddc";
const DISPLAYPLACER = "/opt/homebrew/bin/displayplacer";
const LAYOUT_KEY = "macLayout";

function run(bin: string, ...args: string[]): string {
  return execFileSync(bin, args, { encoding: "utf8", timeout: 10000 }).trim();
}

type Screen = { id: string; builtIn: boolean; res: string; hz: string };

function listScreens(): { screens: Screen[]; restoreArgs: string[] } {
  const out = run(DISPLAYPLACER, "list");
  const screens = out
    .split("Persistent screen id: ")
    .slice(1)
    .map((block) => ({
      id: block.split("\n")[0].trim(),
      builtIn: /Type: MacBook built in screen/.test(block),
      res: block.match(/^Resolution: (\S+)/m)?.[1] ?? "",
      hz: block.match(/^Hertz: (\S+)/m)?.[1] ?? "",
    }));
  // Last line is a ready-made `displayplacer "id:… " "id:… "` command for the current layout.
  const lastLine = out.split("\n").pop() ?? "";
  const restoreArgs = [...lastLine.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { screens, restoreArgs };
}

// Mirror the external screen onto the built-in one so macOS has a single desktop.
async function mirrorToLaptop() {
  const { screens, restoreArgs } = listScreens();
  const laptop = screens.find((s) => s.builtIn);
  const external = screens.find((s) => !s.builtIn);
  if (!laptop || !external) return;
  await LocalStorage.setItem(LAYOUT_KEY, JSON.stringify(restoreArgs));
  run(
    DISPLAYPLACER,
    `id:${laptop.id}+${external.id} res:${laptop.res} hz:${laptop.hz} scaling:on origin:(0,0) degree:0`,
  );
}

async function restoreLayout() {
  const saved = await LocalStorage.getItem<string>(LAYOUT_KEY);
  if (!saved) return;
  run(DISPLAYPLACER, ...JSON.parse(saved));
  await LocalStorage.removeItem(LAYOUT_KEY);
}

export default async function Command() {
  const { macInput, xboxInput } = getPreferenceValues<Preferences>();

  // Some monitors stop answering DDC reads once another input is active; treat that as "on Xbox".
  let current: string | undefined;
  try {
    current = run(M1DDC, "get", "input");
  } catch {
    current = undefined;
  }
  const toXbox = current === macInput;

  try {
    if (toXbox) {
      run(M1DDC, "set", "input", xboxInput);
      await mirrorToLaptop();
    } else {
      await restoreLayout();
      run(M1DDC, "set", "input", macInput);
    }
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Couldn't switch monitor",
      message: (error as Error).message,
    });
    return;
  }
  await showHUD(toXbox ? "Monitor → Xbox" : "Monitor → Mac");
}
