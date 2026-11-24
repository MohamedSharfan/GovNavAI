"use client";

import type { GnDivision, Profile, ProfileExtractResponse } from "@govnav/shared";
import { Camera, Check, LoaderCircle, Lock, ShieldCheck, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import type { MessageKey } from "@/i18n/dictionaries";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shrinkPhoto } from "@/lib/image";
import { formatSlDate, normalizeMobile, parseNic } from "@/lib/sl";
import { deleteAllMyData, getProfile, saveProfile } from "@/lib/store";

const EMPTY: Profile = { address: {}, preferredLanguage: "si", confirmedKeys: [] };
const WARNING_KEYS: Record<string, MessageKey> = {
  photo_unclear: "profile.photoUnclear",
  nic_invalid: "profile.nicInvalid",
  printed_dob_differs_from_nic: "profile.dobMismatch",
};

type TextKey = "fullNameEn" | "fullNameSi" | "fullNameTa" | "nameWithInitials" | "nic" | "phone" | "occupation";

function Field({
  label,
  hint,
  error,
  ai,
  children,
  id,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  ai?: boolean;
  children: ReactNode;
  id: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn("rounded-xl p-3", ai ? "bg-gold/15 ring-1 ring-gold" : "bg-surface ring-1 ring-line")}>
      <label htmlFor={id} className="flex items-center justify-between gap-2 text-sm font-bold">
        {label}
        {ai && (
          <span className="flex items-center gap-1 text-xs font-semibold text-primary-deep">
            <Sparkles aria-hidden className="size-3" />
            {t("profile.aiRead")}
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-primary">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "mt-1 min-h-12 w-full rounded-lg bg-surface-2 px-3 text-base focus:outline-none focus:ring-2 focus:ring-gold";

export function ProfileView() {
  const { t, lang } = useI18n();
  const uid = useId();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [aiKeys, setAiKeys] = useState<Set<string>>(new Set());
  const [scan, setScan] = useState<{ state: "idle" | "busy" | "error"; message?: MessageKey; warnings?: string[] }>({
    state: "idle",
  });
  const [status, setStatus] = useState<MessageKey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [gnDivisions, setGnDivisions] = useState<GnDivision[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void getProfile().then((p) => alive && setProfile(p ?? EMPTY));
    api
      .geo()
      .then(({ districts }) => {
        const ds = districts.flatMap((d) => d.dsDivisions).find((x) => x.id === "kuruwita");
        if (alive) setGnDivisions(ds?.gnDivisions ?? []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const nicInfo = profile?.nic ? parseNic(profile.nic) : null; // cheap; recomputed per render
  const phoneOk = !profile?.phone || normalizeMobile(profile.phone) !== null;

  if (!profile) {
    return (
      <p className="flex items-center gap-2 p-6 text-muted" role="status">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        {t("common.loading")}
      </p>
    );
  }

  // --- Consent gate (PDPA No. 9 of 2022) ---------------------------------------------
  if (!profile.consentAt) {
    return (
      <div className="mx-auto max-w-xl px-4 py-6">
        <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
          <ShieldCheck aria-hidden className="size-8 text-green" />
          <h1 className="mt-2 text-2xl font-extrabold">{t("consent.title")}</h1>
          <p className="mt-2 text-muted">{t("consent.intro")}</p>
          <ul className="mt-4 space-y-3">
            {(["consent.point1", "consent.point2", "consent.point3", "consent.point4"] as const).map((k) => (
              <li key={k} className="flex gap-3">
                <Check aria-hidden className="mt-1 size-5 shrink-0 text-green" />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">{t("consent.law")}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                const next = { ...profile, consentAt: new Date().toISOString(), preferredLanguage: lang };
                void saveProfile(next).then(() => setProfile(next));
              }}
              className="min-h-12 rounded-xl bg-primary px-4 font-semibold text-white hover:bg-primary-strong"
            >
              {t("consent.accept")}
            </button>
            <Link href="/" className="flex min-h-12 items-center justify-center rounded-xl bg-surface-2 font-semibold ring-1 ring-line">
              {t("consent.decline")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const set = (patch: Partial<Profile>, touched: string[]) => {
    setProfile((p) => (p ? { ...p, ...patch } : p));
    setAiKeys((keys) => {
      const next = new Set(keys);
      touched.forEach((k) => next.delete(k));
      return next;
    });
    setStatus(null);
  };

  const text = (key: TextKey, label: MessageKey, opts: { hint?: MessageKey; caps?: boolean; inputMode?: "numeric" | "tel" } = {}) => {
    const id = `${uid}-${key}`;
    const value = (profile[key] as string | null | undefined) ?? "";
    const error =
      key === "nic" && value && !nicInfo ? t("profile.nicError") : key === "phone" && !phoneOk ? t("profile.phoneError") : null;
    return (
      <Field id={id} label={t(label)} hint={opts.hint ? t(opts.hint) : undefined} error={error} ai={aiKeys.has(key)}>
        <input
          id={id}
          value={value}
          inputMode={opts.inputMode}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          onChange={(e) => set({ [key]: opts.caps ? e.target.value.toUpperCase() : e.target.value }, [key])}
          className={cn(inputCls, opts.caps && "uppercase")}
        />
      </Field>
    );
  };

  const address = (k: "si" | "en" | "ta", label: MessageKey) => {
    const id = `${uid}-address-${k}`;
    return (
      <Field id={id} label={t(label)} ai={aiKeys.has(`address.${k}`)}>
        <textarea
          id={id}
          rows={2}
          lang={k}
          value={profile.address?.[k] ?? ""}
          onChange={(e) => set({ address: { ...profile.address, [k]: e.target.value } }, [`address.${k}`])}
          className={cn(inputCls, "py-2")}
        />
      </Field>
    );
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setScan({ state: "busy" });
    try {
      const res: ProfileExtractResponse = await api.extractProfile(await shrinkPhoto(file));
      const patch: Profile = { ...profile, address: { ...profile.address } };
      const touched: string[] = [];
      for (const f of res.fields) {
        if (f.key.startsWith("address.")) {
          const k = f.key.split(".")[1] as "si" | "en" | "ta";
          patch.address = { ...patch.address, [k]: f.value };
        } else if (f.key === "gender") {
          patch.gender = f.value === "female" ? "female" : "male";
        } else {
          (patch as Record<string, unknown>)[f.key] = f.value;
        }
        if (f.source === "ai") touched.push(f.key);
      }
      setProfile(patch);
      setAiKeys(new Set(touched));
      setScan({ state: "idle", warnings: res.warnings });
    } catch (err) {
      setScan({
        state: "error",
        message: err instanceof ApiError && err.kind === "unavailable" ? "profile.scanUnavailable" : "profile.scanFailed",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onSave = async () => {
    const gn = gnDivisions.find((g) => g.code === profile.gnDivisionCode);
    const scalarKeys = [
      "fullNameEn", "fullNameSi", "fullNameTa", "nameWithInitials", "nic", "phone", "occupation", "gnDivisionCode",
    ] as const;
    const filled: string[] = scalarKeys.filter((k) => Boolean(profile[k]));
    (["si", "en", "ta"] as const).forEach((k) => profile.address?.[k] && filled.push(`address.${k}`));
    if (nicInfo) filled.push("dateOfBirth", "gender");
    const next: Profile = {
      ...profile,
      nic: nicInfo?.normalized ?? profile.nic,
      dateOfBirth: nicInfo?.dateOfBirth ?? profile.dateOfBirth,
      gender: nicInfo?.gender ?? profile.gender,
      phone: profile.phone ? (normalizeMobile(profile.phone) ?? profile.phone) : profile.phone,
      gnDivisionName: gn ? gn.name[lang] : profile.gnDivisionName,
      dsDivision: gn ? "Kuruwita" : profile.dsDivision,
      district: gn ? "Ratnapura" : profile.district,
      preferredLanguage: lang,
      confirmedKeys: filled, // the citizen reviewed every value on this screen before saving
    };
    await saveProfile(next);
    setProfile(next);
    setAiKeys(new Set());
    setStatus("profile.saved");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-extrabold">{t("profile.title")}</h1>
      <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t("profile.subtitle")}
      </p>

      {/* Photo → profile */}
      <section className="mt-4 rounded-2xl bg-primary-deep p-4 text-white">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          id={`${uid}-photo`}
          onChange={(e) => void onPhoto(e.target.files?.[0])}
        />
        <label
          htmlFor={`${uid}-photo`}
          className={cn(
            "flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gold px-4 font-bold text-ink",
            scan.state === "busy" && "pointer-events-none opacity-70",
          )}
        >
          {scan.state === "busy" ? (
            <LoaderCircle aria-hidden className="size-5 animate-spin" />
          ) : (
            <Camera aria-hidden className="size-5" />
          )}
          {scan.state === "busy" ? t("profile.scanning") : t("profile.scan")}
        </label>
        <p className="mt-2 text-center text-xs text-white/80">{t("profile.scanHint")}</p>
        {scan.state === "error" && scan.message && (
          <p role="alert" className="mt-3 rounded-lg bg-white/10 p-2 text-sm">
            {t(scan.message)}
          </p>
        )}
        {scan.warnings?.map((w) => (
          <p key={w} role="alert" className="mt-2 flex items-start gap-1.5 rounded-lg bg-saffron/90 p-2 text-sm font-semibold text-white">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {WARNING_KEYS[w] ? t(WARNING_KEYS[w]) : w}
          </p>
        ))}
      </section>

      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
      >
        {text("fullNameEn", "profile.fullNameEn", { hint: "profile.fullNameEnHint", caps: true })}
        {text("fullNameSi", "profile.fullNameSi")}
        {text("fullNameTa", "profile.fullNameTa")}
        {text("nameWithInitials", "profile.nameWithInitials")}
        {text("nic", "profile.nic", { hint: "profile.nicHint" })}

        {nicInfo && (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-green/8 p-3 text-sm ring-1 ring-green/25">
            <p>
              <span className="block text-xs font-bold text-muted">{t("profile.dob")}</span>
              <span className="font-bold">{formatSlDate(nicInfo.dateOfBirth)}</span>
            </p>
            <p>
              <span className="block text-xs font-bold text-muted">{t("profile.gender")}</span>
              <span className="font-bold">{t(nicInfo.gender === "female" ? "profile.female" : "profile.male")}</span>
            </p>
            <p className="col-span-2 flex items-center gap-1 text-xs text-green">
              <Check aria-hidden className="size-3.5" />
              {t("profile.derived")}
            </p>
          </div>
        )}

        {address("si", "profile.addressSi")}
        {address("en", "profile.addressEn")}
        {address("ta", "profile.addressTa")}

        <Field id={`${uid}-gn`} label={t("profile.gnDivision")}>
          <select
            id={`${uid}-gn`}
            value={profile.gnDivisionCode ?? ""}
            onChange={(e) => set({ gnDivisionCode: e.target.value || null }, ["gnDivisionCode"])}
            className={inputCls}
          >
            <option value="">{t("profile.gnSelect")}</option>
            {gnDivisions.map((g) => (
              <option key={g.code} value={g.code}>
                {g.code} · {g.name[lang]}
              </option>
            ))}
          </select>
          {profile.gnDivisionCode && (
            <p className="mt-1 text-xs text-muted">
              {t("profile.dsDivision")}: Kuruwita · {t("profile.district")}: Ratnapura
            </p>
          )}
        </Field>

        {text("phone", "profile.phone", { inputMode: "tel" })}
        {text("occupation", "profile.occupation")}

        <button
          type="submit"
          disabled={Boolean(profile.nic && !nicInfo) || !phoneOk}
          className="min-h-14 w-full rounded-xl bg-primary px-4 text-lg font-bold text-white hover:bg-primary-strong disabled:opacity-50"
        >
          {t("profile.save")}
        </button>
        {status && (
          <p role="status" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-green">
            <Check aria-hidden className="size-4" />
            {t(status)}
          </p>
        )}
      </form>

      {/* Delete my data */}
      <section className="mt-8 rounded-2xl bg-surface p-4 ring-1 ring-line" aria-labelledby={`${uid}-del`}>
        <h2 id={`${uid}-del`} className="flex items-center gap-2 font-extrabold">
          <Trash2 aria-hidden className="size-5 text-primary" />
          {t("profile.deleteTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("profile.deleteBody")}</p>
        {confirmDelete ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                void deleteAllMyData().then(() => {
                  setProfile(EMPTY);
                  setAiKeys(new Set());
                  setConfirmDelete(false);
                  setStatus("profile.deleted");
                });
              }}
              className="min-h-12 rounded-xl bg-primary px-4 font-semibold text-white"
            >
              {t("profile.deleteConfirm")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="min-h-12 rounded-xl bg-surface-2 px-4 font-semibold ring-1 ring-line"
            >
              {t("profile.deleteCancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-3 min-h-12 rounded-xl px-4 font-semibold text-primary ring-1 ring-primary/40 hover:bg-primary/5"
          >
            {t("profile.deleteTitle")}
          </button>
        )}
      </section>
    </div>
  );
}
