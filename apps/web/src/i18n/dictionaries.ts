import en from "./en.json";
import si from "./si.json";
import ta from "./ta.json";

export const LANGS = ["si", "ta", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "si";
export const LANG_COOKIE = "govnav-lang";
export const TEXT_SCALE_COOKIE = "govnav-text";
export const TEXT_SCALES = ["md", "lg", "xl"] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export type Dictionary = typeof en;
export const dictionaries: Record<Lang, Dictionary> = { en, si, ta };

// "home.title" | "chat.office" | … derived from en.json, so a typo is a type error.
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Dictionary>;

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

export function isTextScale(v: unknown): v is TextScale {
  return typeof v === "string" && (TEXT_SCALES as readonly string[]).includes(v);
}

export function lookup(dict: Dictionary, key: string): string {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return key;
  }
  return typeof node === "string" ? node : key;
}

export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  return format(lookup(dictionaries[lang], key), vars);
}
