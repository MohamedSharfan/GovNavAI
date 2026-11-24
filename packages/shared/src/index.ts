export * from "./generated";

/** The three official languages, in the order the UI toggle shows them. */
export const LANGS = ["si", "ta", "en"] as const;
export type UiLang = (typeof LANGS)[number];
