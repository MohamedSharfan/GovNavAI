"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/i18n/dictionaries";

const noopSubscribe = () => () => {};

const BCP47: Record<Lang, string> = { si: "si-LK", ta: "ta-LK", en: "en-LK" };

/** Read-aloud with the browser's speech engine (Gemini TTS replaces this in M3). */
export function useReadAloud() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "speechSynthesis" in window,
    () => false,
  );

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  const speak = useCallback(
    (id: string, text: string, lang: Lang) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      if (speakingId === id) {
        setSpeakingId(null);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = BCP47[lang];
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang));
      if (voice) u.voice = voice;
      u.rate = 0.92;
      u.onend = () => setSpeakingId(null);
      u.onerror = () => setSpeakingId(null);
      setSpeakingId(id);
      window.speechSynthesis.speak(u);
    },
    [speakingId, supported],
  );

  return { speak, speakingId, supported };
}

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** Voice input via the browser where available (Gemini Live API replaces this in M3). */
export function useVoiceInput(lang: Lang, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<InstanceType<RecognitionCtor> | null>(null);
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => {
      const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
      return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    },
    () => false,
  );

  const toggle = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = BCP47[lang];
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript;
      if (text) onText(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, [lang, listening, onText]);

  return { listening, supported, toggle };
}
