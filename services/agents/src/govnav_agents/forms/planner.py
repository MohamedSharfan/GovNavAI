"""Deterministic form-fill planning: profile + confirmed drafts → every field's value and status.

Gemini (``form_fill_agent``) only drafts the *purpose of request* wording and name/address
transliterations. Everything else is mapped here: which profile value goes where, in which
script, date formats (YYYY.MM.DD), and whether a field is auto-filled, needs checking, must
be typed by the citizen, signed by hand, or belongs to an officer.
"""

from __future__ import annotations

import datetime as dt

from govnav_agents.schemas import (
    FieldScript,
    FieldType,
    FillMode,
    FillPlan,
    FillPlanField,
    FillStatus,
    FormDraft,
    FormMap,
    Gender,
    Lang,
    LocalizedText,
    Profile,
    ProfileKey,
)
from govnav_agents.sl.formats import format_sl_date

GENDER_LABELS = {
    Gender.FEMALE: LocalizedText(en="Female", si="ස්ත්‍රී", ta="பெண்"),
    Gender.MALE: LocalizedText(en="Male", si="පුරුෂ", ta="ஆண்"),
}
SIGN_IN_FRONT = LocalizedText(
    en="Sign {label} in front of the officer.",
    si="{label} නිලධාරියා ඉදිරියේ අත්සන් කරන්න.",
    ta="{label} அலுவலர் முன்னிலையில் கையொப்பமிடுங்கள்.",
)


def _target_script(field_script: FieldScript, form_langs: list[Lang], lang: Lang) -> FieldScript:
    if field_script is not FieldScript.AS_PROFILE:
        return field_script
    if len(form_langs) == 1:
        return FieldScript(form_langs[0].value)
    return FieldScript(lang.value)


def _name_for(script: FieldScript, p: Profile, draft: FormDraft | None) -> tuple[str | None, str | None]:
    """Return (value, source) for a full-name field in the required script."""
    if script is FieldScript.LATIN_CAPS:
        return (p.full_name_en.upper(), "profile") if p.full_name_en else (None, None)
    if script is FieldScript.EN:
        return (p.full_name_en, "profile") if p.full_name_en else (None, None)
    if script is FieldScript.SI:
        if p.full_name_si:
            return p.full_name_si, "profile"
        return (draft.name_si, "ai") if draft and draft.name_si else (None, None)
    if script is FieldScript.TA:
        if p.full_name_ta:
            return p.full_name_ta, "profile"
        return (draft.name_ta, "ai") if draft and draft.name_ta else (None, None)
    return None, None


def _address_for(script: FieldScript, p: Profile, draft: FormDraft | None) -> tuple[str | None, str | None]:
    a = p.address
    if script is FieldScript.SI:
        if a.si:
            return a.si, "profile"
        if draft and draft.address_si:
            return draft.address_si, "ai"
    if script is FieldScript.TA:
        if a.ta:
            return a.ta, "profile"
        if draft and draft.address_ta:
            return draft.address_ta, "ai"
    if a.en:
        # An English address on a Sinhala/Tamil form is acceptable but should be checked.
        return a.en, "profile" if script in (FieldScript.EN, FieldScript.LATIN_CAPS) else "ai"
    return None, None


def plan_fill(
    form: FormMap,
    profile: Profile,
    *,
    lang: Lang,
    draft: FormDraft | None = None,
    inputs: dict[str, str] | None = None,
    today: dt.date | None = None,
    demo_data: bool = False,
    source_url: str | None = None,
) -> FillPlan:
    inputs = inputs or {}
    today = today or dt.date.today()
    confirmed = set(profile.confirmed_keys)
    fields: list[FillPlanField] = []
    manual_steps: list[LocalizedText] = []

    for f in form.fields:
        script = _target_script(f.script, form.language, lang)
        value: str | None = None
        source: str | None = None
        key = f.profile_key

        if f.fill_mode is FillMode.OFFICER:
            status = FillStatus.OFFICER
        elif f.fill_mode is FillMode.MANUAL:
            status = FillStatus.MANUAL
            label = f.label.get(lang) if not f.number else f"{f.number}"
            manual_steps.append(
                f.hint
                or LocalizedText(
                    en=SIGN_IN_FRONT.en.format(label=label),
                    si=SIGN_IN_FRONT.si.format(label=label),
                    ta=SIGN_IN_FRONT.ta.format(label=label),
                )
            )
        elif f.fill_mode is FillMode.INPUT:
            value = (inputs.get(f.id) or "").strip() or None
            source = "citizen" if value else None
            status = FillStatus.AUTO if value else FillStatus.INPUT
        else:
            if key in (
                ProfileKey.FULL_NAME,
                ProfileKey.FULL_NAME_SI,
                ProfileKey.FULL_NAME_TA,
                ProfileKey.FULL_NAME_EN,
            ):
                forced = {
                    ProfileKey.FULL_NAME_SI: FieldScript.SI,
                    ProfileKey.FULL_NAME_TA: FieldScript.TA,
                    ProfileKey.FULL_NAME_EN: FieldScript.LATIN_CAPS,
                }.get(key, script)
                value, source = _name_for(forced, profile, draft)
            elif key is ProfileKey.ADDRESS:
                value, source = _address_for(script, profile, draft)
            elif key is ProfileKey.NIC:
                value, source = (profile.nic, "profile") if profile.nic else (None, None)
            elif key is ProfileKey.DATE_OF_BIRTH and profile.date_of_birth:
                value, source = format_sl_date(profile.date_of_birth), "derived"
            elif key is ProfileKey.GENDER and profile.gender:
                value, source = (
                    GENDER_LABELS[profile.gender].get(script.value if script.value in "si ta en" else "en"),
                    "derived",
                )
            elif key is ProfileKey.TODAY:
                value, source = format_sl_date(today), "derived"
            elif key is ProfileKey.PURPOSE:
                value, source = (draft.purpose, "ai") if draft and draft.purpose else (None, None)
            elif key is not None:
                raw = getattr(profile, _attr(key), None)
                value, source = (str(raw), "profile") if raw else (None, None)

            if value is None:
                status = FillStatus.MISSING
            elif (
                source == "ai"
                or f.fill_mode is FillMode.CONFIRM
                or (
                    source == "profile"
                    and key is not None
                    and confirmed
                    and _confirm_key(key) not in confirmed
                )
            ):
                status = FillStatus.CONFIRM
            else:
                status = FillStatus.AUTO

        if value and f.type is FieldType.TEXT and f.max_chars:
            value = value[: f.max_chars]
        fields.append(
            FillPlanField(
                id=f.id,
                number=f.number,
                label=f.label,
                page=f.page,
                bbox=f.bbox,
                type=f.type,
                status=status,
                value=value,
                source=source,
                optional=f.optional,
                hint=f.hint,
                max_chars=f.max_chars,
            )
        )

    return FillPlan(
        form_id=form.id,
        code=form.code,
        name=form.name,
        page_count=form.page_count,
        verified_year=form.verified_year,
        demo_data=demo_data or form.verification.demo_data,
        source_url=source_url,
        fields=fields,
        filled_pct=filled_percentage(fields),
        manual_steps=manual_steps,
    )


def filled_percentage(fields: list[FillPlanField]) -> int:
    """Share of the citizen's part that is ready: officer sections never count, optional
    sections count only when used, and hand-done steps (signature) count as not yet done."""
    countable = [f for f in fields if f.status is not FillStatus.OFFICER and (not f.optional or f.value)]
    if not countable:
        return 0
    done = sum(1 for f in countable if f.value and f.status in (FillStatus.AUTO, FillStatus.CONFIRM))
    return round(100 * done / len(countable))


_ATTRS = {
    ProfileKey.NAME_WITH_INITIALS: "name_with_initials",
    ProfileKey.GN_DIVISION_NAME: "gn_division_name",
    ProfileKey.GN_DIVISION_CODE: "gn_division_code",
    ProfileKey.DS_DIVISION: "ds_division",
    ProfileKey.DISTRICT: "district",
    ProfileKey.PHONE: "phone",
    ProfileKey.OCCUPATION: "occupation",
    ProfileKey.CIVIL_STATUS: "civil_status",
}


def _attr(key: ProfileKey) -> str:
    return _ATTRS.get(key, key.value)


def _confirm_key(key: ProfileKey) -> str:
    return {ProfileKey.FULL_NAME: "fullNameSi", ProfileKey.ADDRESS: "address.si"}.get(key, key.value)
