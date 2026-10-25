import type { SettingDefinition } from "../setting";
import { coreSetting } from "./core";
import { keyforgeSetting } from "./keyforge";
import { terrinothSetting } from "./terrinoth";

/** Every setting a character can use, in the order the sheet lists them. */
export const SETTINGS: readonly SettingDefinition[] = [coreSetting, terrinothSetting, keyforgeSetting];

/** The setting with this id, or core if it's unknown. */
export function settingById(id: string | undefined): SettingDefinition {
  return SETTINGS.find((s) => s.id === id) ?? coreSetting;
}

/** True if the setting's sheet has this block, e.g. Terrinoth's heroic ability. */
export function settingHas(setting: SettingDefinition, block: SettingDefinition["pages"][number][number]): boolean {
  return setting.pages.some((page) => page.includes(block));
}

export { coreSetting, keyforgeSetting, terrinothSetting };
