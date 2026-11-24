import { describe, expect, it } from "vitest";
import { dictionaries, format, LANGS, translate } from "./dictionaries";

function keys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("i18n parity", () => {
  const reference = keys(dictionaries.en).sort();
  it.each(LANGS)("%s has exactly the English keys", (lang) => {
    expect(keys(dictionaries[lang]).sort()).toEqual(reference);
  });

  it.each(["si", "ta"] as const)("%s strings are translated (not English copies)", (lang) => {
    const allowSame = new Set(["app.name", "chat.assistant", "lang.si", "lang.ta", "lang.en", "lang.siFull", "lang.taFull", "lang.enFull"]);
    const same = reference.filter(
      (k) => !allowSame.has(k) && translate(lang, k as never) === translate("en", k as never),
    );
    expect(same).toEqual([]);
  });

  it("keeps placeholders in every language", () => {
    for (const k of reference) {
      const en = translate("en", k as never).match(/\{\w+\}/g)?.sort() ?? [];
      for (const lang of LANGS) {
        expect(translate(lang, k as never).match(/\{\w+\}/g)?.sort() ?? [], `${lang}:${k}`).toEqual(en);
      }
    }
  });

  it("formats variables", () => {
    expect(format("{done} of {total}", { done: 2, total: 4 })).toBe("2 of 4");
  });
});
