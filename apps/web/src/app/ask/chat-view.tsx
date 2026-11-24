"use client";

import type { AskResponse } from "@govnav/shared";
import { ChevronLeft, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AskBar } from "@/components/chat/ask-bar";
import { AnswerCard, DeclineCard } from "@/components/chat/answer-cards";
import { ProcedurePanel } from "@/components/procedure-panel";
import { useI18n } from "@/components/providers/i18n-provider";
import type { Lang, MessageKey } from "@/i18n/dictionaries";
import { api, ApiError } from "@/lib/api";
import { useReadAloud } from "@/lib/speech";
import { takePendingQuestion, touchRequest } from "@/lib/store";

type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; response: AskResponse }
  | { id: string; role: "error"; key: MessageKey; retry: string };

export function ChatView({ procedureCount }: { procedureCount: number | null }) {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [activeProcedure, setActiveProcedure] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const { speak, speakingId, supported } = useReadAloud();

  const send = useCallback(
    async (text: string) => {
      const userMsg: Msg = { id: crypto.randomUUID(), role: "user", text };
      setMessages((m) => [...m.filter((x) => x.role !== "error"), userMsg]);
      setPending(true);
      try {
        const res = await api.ask({
          message: text,
          uiLanguage: lang,
          sessionId,
          procedureContext: activeProcedure,
        });
        setSessionId(res.sessionId);
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", response: res }]);
        if (res.card.kind === "answer") {
          setActiveProcedure(res.card.procedureId);
          // The citizen's own words become the hint for the form's "purpose of request".
          void touchRequest(res.card.procedureId, res.language, { purpose: text });
        }
      } catch (err) {
        const key: MessageKey =
          err instanceof ApiError && err.kind === "rate_limited"
            ? "chat.rateLimited"
            : err instanceof ApiError && err.kind === "network"
              ? "chat.networkError"
              : "chat.error";
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "error", key, retry: text }]);
      } finally {
        setPending(false);
      }
    },
    [activeProcedure, lang, sessionId],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const q = takePendingQuestion();
    // Deferred so the first send happens after mount, not inside the effect body.
    if (q) queueMicrotask(() => void send(q));
  }, [send]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const reset = () => {
    setMessages([]);
    setSessionId(null);
    setActiveProcedure(null);
  };

  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="flex min-h-[calc(100dvh-8rem)] flex-col lg:h-dvh lg:min-h-0" aria-label={t("chat.title")}>
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
          <Link
            href="/"
            aria-label={t("common.back")}
            className="flex size-11 items-center justify-center rounded-xl bg-surface-2 lg:hidden"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-extrabold">{t("chat.title")}</h1>
            {procedureCount !== null && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className="size-2 rounded-full bg-green" aria-hidden />
                {t("chat.subtitle", { count: procedureCount })}
              </p>
            )}
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-primary/5"
            >
              <RotateCcw aria-hidden className="size-4" />
              <span className="hidden sm:inline">{t("chat.newChat")}</span>
            </button>
          )}
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite" aria-busy={pending}>
          {messages.length === 0 && !pending && (
            <div className="mx-auto max-w-md rounded-2xl bg-surface p-5 text-center ring-1 ring-line">
              <Sparkles aria-hidden className="mx-auto size-6 text-gold" />
              <p className="mt-2 text-muted">{t("chat.empty")}</p>
            </div>
          )}
          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary-deep px-4 py-3 text-white">
                    <span className="sr-only">{t("chat.you")}: </span>
                    {m.text}
                  </p>
                </div>
              );
            }
            if (m.role === "error") {
              return (
                <div key={m.id} role="alert" className="rounded-2xl bg-saffron/10 p-4 ring-1 ring-saffron/30">
                  <p className="font-semibold text-saffron-ink">{t(m.key)}</p>
                  <button
                    type="button"
                    onClick={() => void send(m.retry)}
                    className="mt-2 min-h-11 rounded-xl bg-surface px-4 font-semibold ring-1 ring-line"
                  >
                    {t("chat.retry")}
                  </button>
                </div>
              );
            }
            const card = m.response.card;
            const lang = m.response.language as Lang;
            return (
              <div key={m.id} className="max-w-2xl">
                {card.kind === "answer" && (
                  <AnswerCard
                    card={card}
                    response={m.response}
                    readAloud={{
                      supported,
                      speaking: speakingId === m.id,
                      onToggle: () => speak(m.id, `${card.procedureName}. ${card.text}`, lang),
                    }}
                  />
                )}
                {card.kind === "decline" && (
                  <DeclineCard card={card} response={m.response} onSuggest={(name) => void send(name)} />
                )}
                {card.kind === "greeting" && (
                  <p className="rounded-2xl bg-surface p-4 ring-1 ring-line" lang={lang}>
                    {card.text}
                  </p>
                )}
              </div>
            );
          })}
          {pending && (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
              {t("chat.thinking")}
            </p>
          )}
          <div ref={endRef} />
        </div>

        <div className="sticky bottom-16 border-t border-line bg-bg/95 p-3 backdrop-blur lg:bottom-0">
          <AskBar variant="composer" onSubmit={(q) => void send(q)} disabled={pending} />
          <p className="mt-2 text-center text-[0.7rem] text-muted">{t("app.limits")}</p>
        </div>
      </section>

      <aside className="hidden overflow-y-auto border-l border-line bg-surface lg:block" aria-live="polite">
        {activeProcedure ? (
          <ProcedurePanel key={activeProcedure} procedureId={activeProcedure} />
        ) : (
          <div className="p-8 text-muted">
            <p>{t("chat.empty")}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
