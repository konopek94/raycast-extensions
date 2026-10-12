import { getPreferenceValues } from "@raycast/api";
import { parse, type Parsed } from "./parse";

/** Quick-start entries from the "Presets" preference, e.g. "5m, 25m focus, 1h". */
export function getPresets(): { label: string; parsed: Parsed }[] {
  const { presets } = getPreferenceValues<Preferences>();
  return presets
    .split(",")
    .map((label) => label.trim())
    .flatMap((label) => {
      const parsed = parse(label);
      return parsed ? [{ label, parsed }] : [];
    });
}
