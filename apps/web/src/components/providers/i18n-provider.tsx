"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  LANG_COOKIE,
  TEXT_SCALE_COOKIE,
  translate,
  type Lang,
  type MessageKey,
  type TextScale,
} from "@/i18n/dictionaries";

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);
const YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

export function I18nProvider({
  initialLang,
  initialTextScale,
  children,
}: {
  initialLang: Lang;
  initialTextScale: TextScale;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [textScale, setTextScaleState] = useState<TextScale>(initialTextScale);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    writeCookie(LANG_COOKIE, next);
    document.documentElement.lang = next;
  }, []);

  const setTextScale = useCallback((next: TextScale) => {
    setTextScaleState(next);
    writeCookie(TEXT_SCALE_COOKIE, next);
    document.documentElement.dataset.textScale = next;
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars), textScale, setTextScale }),
    [lang, setLang, textScale, setTextScale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
