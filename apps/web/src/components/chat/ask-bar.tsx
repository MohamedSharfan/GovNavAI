"use client";

import { Mic, MicOff, Search, SendHorizontal } from "lucide-react";
import { useCallback, useId, useState, type FormEvent } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { useVoiceInput } from "@/lib/speech";
import { cn } from "@/lib/cn";

interface AskBarProps {
  onSubmit: (text: string) => void;
  variant?: "hero" | "composer";
  disabled?: boolean;
  autoFocus?: boolean;
}

/** The ask input with mic, used on Home (hero) and in the chat (composer). */
export function AskBar({ onSubmit, variant = "hero", disabled, autoFocus }: AskBarProps) {
  const { t, lang } = useI18n();
  const [value, setValue] = useState("");
  const inputId = useId();

  const submit = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q || disabled) return;
      onSubmit(q);
      setValue("");
    },
    [disabled, onSubmit],
  );
  const voice = useVoiceInput(lang, submit);

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(value);
  };

  const hero = variant === "hero";
  return (
    <form
      onSubmit={onFormSubmit}
      role="search"
      className={cn(
        "flex items-center gap-2 rounded-2xl bg-surface p-2",
        hero ? "shadow-lg shadow-black/20" : "ring-1 ring-line",
      )}
    >
      {hero && <Search aria-hidden className="ml-2 size-5 shrink-0 text-primary" />}
      <label htmlFor={inputId} className="sr-only">
        {t("home.askLabel")}
      </label>
      <input
        id={inputId}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={hero ? t("home.askPlaceholder") : t("chat.placeholder")}
        maxLength={1000}
        autoComplete="off"
        enterKeyHint="send"
        autoFocus={autoFocus}
        disabled={disabled}
        className="min-h-12 min-w-0 flex-1 bg-transparent px-2 text-base text-ink placeholder:text-muted focus:outline-none"
      />
      {value.trim() ? (
        <button
          type="submit"
          disabled={disabled}
          aria-label={t("chat.send")}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white hover:bg-primary-strong disabled:opacity-50"
        >
          <SendHorizontal aria-hidden className="size-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={voice.toggle}
          disabled={!voice.supported || disabled}
          aria-pressed={voice.listening}
          aria-label={voice.supported ? t("home.voice") : t("home.voiceSoon")}
          title={voice.supported ? t("home.voice") : t("home.voiceSoon")}
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40",
            voice.listening ? "animate-pulse bg-saffron text-white" : "bg-gold/25 text-primary-deep hover:bg-gold/40",
          )}
        >
          {voice.listening ? <MicOff aria-hidden className="size-5" /> : <Mic aria-hidden className="size-5" />}
        </button>
      )}
    </form>
  );
}
