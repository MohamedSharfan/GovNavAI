"""Canonical data and API schemas for GovNavAI.

These Pydantic models are the single source of truth. They are exported to JSON
Schema in ``packages/shared/schemas`` and turned into TypeScript types for the web
app (``pnpm schemas``). Every knowledge-base record and every model output is
validated against one of these models before it is used.
"""

from __future__ import annotations

import datetime as dt
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------

Slug = Annotated[str, Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=2, max_length=64)]


class Lang(StrEnum):
    """UI / answer language."""

    SI = "si"
    TA = "ta"
    EN = "en"


class InputVariety(StrEnum):
    """How the citizen wrote the query (for per-variety evaluation)."""

    SI = "si"
    TA = "ta"
    EN = "en"
    SINGLISH = "singlish"
    TANGLISH = "tanglish"


class StrictModel(BaseModel):
    """Base model that rejects unknown keys (catches typos in seed data)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class LocalizedText(StrictModel):
    """A user-facing string in all three official languages."""

    en: str = Field(min_length=1)
    si: str = Field(min_length=1)
    ta: str = Field(min_length=1)

    def get(self, lang: Lang | str) -> str:
        """Return the text for ``lang`` (falls back to English)."""
        return str(getattr(self, str(lang), None) or self.en)


class SourceKind(StrEnum):
    CIRCULAR = "circular"
    GAZETTE = "gazette"
    ACT = "act"
    WEBSITE = "website"
    FORM = "form"
    OFFICE_NOTICE = "office_notice"
    FIELD_VISIT = "field_visit"


class SourceRef(StrictModel):
    """An authorising or informing source for one or more facts."""

    id: Slug
    title: str
    url: str | None = None
    kind: SourceKind
    section: str | None = None
    publisher: str | None = None
    retrieved_at: dt.date = Field(alias="retrievedAt")


class RecordStatus(StrEnum):
    DRAFT = "draft"
    APPROVED = "approved"


class Verification(StrictModel):
    """Human-in-the-loop provenance kept on every record."""

    status: RecordStatus
    source_ref: str = Field(alias="sourceRef", description="Primary SourceRef id")
    verified_by: str | None = Field(default=None, alias="verifiedBy")
    verified_at: dt.date | None = Field(default=None, alias="verifiedAt")
    demo_data: bool = Field(
        default=False,
        alias="demoData",
        description="True when one or more facts could not be confirmed from an official source.",
    )

    @model_validator(mode="after")
    def _approved_needs_officer(self) -> Verification:
        if self.status is RecordStatus.APPROVED and not (self.verified_by and self.verified_at):
            raise ValueError("approved records need verifiedBy and verifiedAt")
        return self


# ---------------------------------------------------------------------------
# Knowledge base: procedures
# ---------------------------------------------------------------------------


class ProcedureCategory(StrEnum):
    CIVIL_REGISTRATION = "civil-registration"
    IDENTITY = "identity"
    LAND_PROPERTY = "land-property"
    WELFARE_CERTIFICATES = "welfare-certificates"
    LICENSING = "licensing"


class OfficeType(StrEnum):
    GN = "GN"
    DS = "DS"
    DISTRICT = "DISTRICT"
    RGD = "RGD"
    DRP = "DRP"
    LAND_REGISTRY = "LAND_REGISTRY"
    OTHER = "OTHER"


class Fee(StrictModel):
    amount_lkr: int | None = Field(default=None, alias="amountLkr", ge=0)
    is_free: bool = Field(alias="isFree")
    text: LocalizedText
    short: LocalizedText | None = Field(
        default=None, description="Card-sized value (e.g. 'Rs 120 – 250'); text holds the full rule."
    )

    def label(self, lang: Lang | str) -> str:
        return (self.short or self.text).get(lang)

    @model_validator(mode="after")
    def _consistent(self) -> Fee:
        if self.is_free and self.amount_lkr not in (None, 0):
            raise ValueError("free fee cannot have a positive amount")
        return self


class ProcessingTime(StrictModel):
    min_days: int | None = Field(default=None, alias="minDays", ge=0)
    max_days: int | None = Field(default=None, alias="maxDays", ge=0)
    text: LocalizedText
    short: LocalizedText | None = None

    def label(self, lang: Lang | str) -> str:
        return (self.short or self.text).get(lang)


class RequiredDocument(StrictModel):
    id: Slug
    name: LocalizedText
    note: LocalizedText | None = None
    conditional: LocalizedText | None = Field(
        default=None, description="When this document is needed, if not always."
    )
    ai_can_prefill: bool = Field(default=False, alias="aiCanPrefill")
    form_id: str | None = Field(default=None, alias="formId")


class ExampleQuestions(StrictModel):
    en: list[str] = Field(default_factory=list)
    si: list[str] = Field(default_factory=list)
    ta: list[str] = Field(default_factory=list)
    singlish: list[str] = Field(default_factory=list)
    tanglish: list[str] = Field(default_factory=list)

    def all(self) -> list[str]:
        return [*self.en, *self.si, *self.ta, *self.singlish, *self.tanglish]


class Procedure(StrictModel):
    """A verified government procedure: the unit of the knowledge base."""

    id: Slug
    version: int = Field(default=1, ge=1)
    category: ProcedureCategory
    name: LocalizedText
    summary: LocalizedText
    synonyms: list[str] = Field(default_factory=list)
    example_questions: ExampleQuestions = Field(alias="exampleQuestions")
    office_type: OfficeType = Field(alias="officeType")
    office_flow: LocalizedText = Field(alias="officeFlow")
    fee: Fee
    processing_time: ProcessingTime = Field(alias="processingTime")
    required_documents: list[RequiredDocument] = Field(alias="requiredDocuments", min_length=1)
    eligibility: LocalizedText | None = None
    steps: list[LocalizedText] = Field(default_factory=list)
    form_ids: list[str] = Field(default_factory=list, alias="formIds")
    sources: list[SourceRef] = Field(min_length=1)
    field_sources: dict[str, list[str]] = Field(
        default_factory=dict,
        alias="fieldSources",
        description="Per-field citations: field name -> SourceRef ids.",
    )
    verification: Verification

    @model_validator(mode="after")
    def _citations_resolve(self) -> Procedure:
        ids = {s.id for s in self.sources}
        if self.verification.source_ref not in ids:
            raise ValueError(f"verification.sourceRef {self.verification.source_ref!r} not in sources")
        for field_name, refs in self.field_sources.items():
            missing = [r for r in refs if r not in ids]
            if missing:
                raise ValueError(f"fieldSources[{field_name}] references unknown sources {missing}")
        doc_ids = [d.id for d in self.required_documents]
        if len(doc_ids) != len(set(doc_ids)):
            raise ValueError("requiredDocuments ids must be unique")
        return self

    def source(self, source_id: str) -> SourceRef | None:
        return next((s for s in self.sources if s.id == source_id), None)

    @property
    def primary_source(self) -> SourceRef:
        src = self.source(self.verification.source_ref)
        assert src is not None  # guaranteed by validator
        return src


# ---------------------------------------------------------------------------
# Knowledge base: offices and geography
# ---------------------------------------------------------------------------


class GeoPoint(StrictModel):
    lat: float = Field(ge=5.5, le=10.0, description="Sri Lanka latitude range")
    lng: float = Field(ge=79.4, le=82.0, description="Sri Lanka longitude range")


class OpeningHours(StrictModel):
    days: list[Annotated[int, Field(ge=0, le=6)]] = Field(min_length=1, description="0=Monday … 6=Sunday")
    open: str = Field(pattern=r"^\d{2}:\d{2}$")
    close: str = Field(pattern=r"^\d{2}:\d{2}$")


class AdminArea(StrictModel):
    province: str
    district: str
    ds_division: str | None = Field(default=None, alias="dsDivision")
    gn_code: str | None = Field(default=None, alias="gnCode")


class QueueStatus(StrEnum):
    NORMAL = "normal"
    BUSY = "busy"


class Office(StrictModel):
    id: Slug
    type: OfficeType
    name: LocalizedText
    address: LocalizedText
    location: GeoPoint
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    hours: list[OpeningHours] = Field(default_factory=list)
    hours_note: LocalizedText | None = Field(default=None, alias="hoursNote")
    handles: list[str] = Field(default_factory=list, description="Procedure ids handled here")
    admin_area: AdminArea = Field(alias="adminArea")
    place_id: str | None = Field(default=None, alias="placeId")
    queue_status: QueueStatus = Field(default=QueueStatus.NORMAL, alias="queueStatus")
    sources: list[SourceRef] = Field(min_length=1)
    verification: Verification


class GnDivision(StrictModel):
    code: str
    name: LocalizedText


class DsDivision(StrictModel):
    id: Slug
    name: LocalizedText
    gn_divisions: list[GnDivision] = Field(default_factory=list, alias="gnDivisions")


class District(StrictModel):
    id: Slug
    name: LocalizedText
    province: LocalizedText
    ds_divisions: list[DsDivision] = Field(alias="dsDivisions")
    sources: list[SourceRef] = Field(min_length=1)


# ---------------------------------------------------------------------------
# Forms (contract owned jointly; pipeline owned by Member 2)
# ---------------------------------------------------------------------------


class ProfileKey(StrEnum):
    """Keys a form field may map to. Kept in sync with the web Profile type."""

    FULL_NAME_EN = "fullNameEn"
    FULL_NAME_SI = "fullNameSi"
    FULL_NAME_TA = "fullNameTa"
    FULL_NAME = "fullName"  # resolved to the form's script at fill time
    NAME_WITH_INITIALS = "nameWithInitials"
    NIC = "nic"
    DATE_OF_BIRTH = "dateOfBirth"
    GENDER = "gender"
    ADDRESS = "address"
    GN_DIVISION_NAME = "gnDivisionName"
    GN_DIVISION_CODE = "gnDivisionCode"
    DS_DIVISION = "dsDivision"
    DISTRICT = "district"
    PHONE = "phone"
    OCCUPATION = "occupation"
    CIVIL_STATUS = "civilStatus"
    PURPOSE = "purpose"  # written from the conversation
    TODAY = "today"


class FieldType(StrEnum):
    TEXT = "text"
    MULTILINE = "multiline"
    DATE = "date"
    NIC = "nic"
    PHONE = "phone"
    CHECKBOX = "checkbox"
    SIGNATURE = "signature"


class FillMode(StrEnum):
    AUTO = "auto"  # filled from a confirmed profile value
    CONFIRM = "confirm"  # filled, but the citizen must check it (e.g. AI-written purpose)
    MANUAL = "manual"  # citizen writes by hand (e.g. signature in front of officer)
    OFFICER = "officer"  # officer-only section, never filled


class FieldScript(StrEnum):
    AS_PROFILE = "as_profile"
    SI = "si"
    TA = "ta"
    EN = "en"
    LATIN_CAPS = "latin_caps"


class BBox(StrictModel):
    """Normalised bounding box, origin top-left, all values 0..1."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def _inside_page(self) -> BBox:
        if self.x + self.w > 1.0001 or self.y + self.h > 1.0001:
            raise ValueError("bbox extends past the page")
        return self


class FormField(StrictModel):
    id: Slug
    number: str | None = None
    label: LocalizedText
    page: int = Field(ge=0)
    bbox: BBox
    type: FieldType = FieldType.TEXT
    profile_key: ProfileKey | None = Field(default=None, alias="profileKey")
    fill_mode: FillMode = Field(alias="fillMode")
    script: FieldScript = FieldScript.AS_PROFILE
    max_chars: int | None = Field(default=None, alias="maxChars", gt=0)
    font_size: float | None = Field(default=None, alias="fontSize", gt=0)
    hint: LocalizedText | None = None


class PageSize(StrictModel):
    width: float = Field(gt=0, description="PDF points")
    height: float = Field(gt=0, description="PDF points")


class FormMap(StrictModel):
    id: Slug
    code: str
    name: LocalizedText
    procedure_ids: list[str] = Field(alias="procedureIds", min_length=1)
    pdf_path: str = Field(alias="pdfPath")
    page_count: int = Field(alias="pageCount", ge=1)
    page_sizes: list[PageSize] = Field(alias="pageSizes", min_length=1)
    verified_year: int | None = Field(default=None, alias="verifiedYear")
    language: list[Lang] = Field(default_factory=lambda: [Lang.SI, Lang.TA, Lang.EN])
    fields: list[FormField]
    sources: list[SourceRef] = Field(min_length=1)
    verification: Verification

    @model_validator(mode="after")
    def _pages_consistent(self) -> FormMap:
        if len(self.page_sizes) != self.page_count:
            raise ValueError("pageSizes length must equal pageCount")
        for f in self.fields:
            if f.page >= self.page_count:
                raise ValueError(f"field {f.id} on page {f.page} but form has {self.page_count} pages")
        return self


# ---------------------------------------------------------------------------
# Device-side citizen data (schemas shared so the server can validate per-request
# payloads; the server never stores these).
# ---------------------------------------------------------------------------


class Gender(StrEnum):
    FEMALE = "female"
    MALE = "male"


class Address(StrictModel):
    en: str | None = None
    si: str | None = None
    ta: str | None = None


class Profile(StrictModel):
    full_name_en: str | None = Field(default=None, alias="fullNameEn")
    full_name_si: str | None = Field(default=None, alias="fullNameSi")
    full_name_ta: str | None = Field(default=None, alias="fullNameTa")
    name_with_initials: str | None = Field(default=None, alias="nameWithInitials")
    nic: str | None = None
    date_of_birth: dt.date | None = Field(default=None, alias="dateOfBirth")
    gender: Gender | None = None
    address: Address = Field(default_factory=Address)
    gn_division_code: str | None = Field(default=None, alias="gnDivisionCode")
    gn_division_name: str | None = Field(default=None, alias="gnDivisionName")
    ds_division: str | None = Field(default=None, alias="dsDivision")
    district: str | None = None
    phone: str | None = None
    occupation: str | None = None
    civil_status: str | None = Field(default=None, alias="civilStatus")
    preferred_language: Lang = Field(default=Lang.SI, alias="preferredLanguage")
    confirmed_keys: list[str] = Field(default_factory=list, alias="confirmedKeys")
    consent_at: dt.datetime | None = Field(
        default=None, alias="consentAt", description="When the citizen accepted the privacy notice."
    )


class DocumentType(StrEnum):
    NIC_OLD = "nic_old"
    NIC_NEW = "nic_new"
    UTILITY_BILL = "utility_bill"
    OTHER = "other"


class DocumentExtraction(StrictModel):
    """Gemini vision output for an NIC or utility-bill photo. Values as printed; null if absent."""

    document_type: DocumentType = Field(alias="documentType")
    full_name_en: str | None = Field(default=None, alias="fullNameEn")
    full_name_si: str | None = Field(default=None, alias="fullNameSi")
    full_name_ta: str | None = Field(default=None, alias="fullNameTa")
    nic: str | None = None
    date_of_birth: str | None = Field(default=None, alias="dateOfBirth", description="As printed")
    address_en: str | None = Field(default=None, alias="addressEn")
    address_si: str | None = Field(default=None, alias="addressSi")
    address_ta: str | None = Field(default=None, alias="addressTa")
    account_holder: str | None = Field(default=None, alias="accountHolder")
    legibility: float = Field(ge=0, le=1, description="0 = unreadable photo, 1 = perfectly clear")


class ExtractedField(StrictModel):
    key: str = Field(description="Profile key, e.g. fullNameEn, nic, address.si")
    value: str
    source: Literal["ai", "derived"] = "ai"
    warning: str | None = None


class ProfileExtractResponse(StrictModel):
    document_type: DocumentType = Field(alias="documentType")
    fields: list[ExtractedField]
    warnings: list[str] = Field(default_factory=list)
    image_retained: Literal[False] = Field(default=False, alias="imageRetained")


class RequestStatus(StrEnum):
    EXPLORING = "exploring"
    CHECKLIST = "checklist"
    FORM_READY = "form_ready"
    VISITED = "visited"


class VisitOutcome(StrEnum):
    UNKNOWN = "unknown"
    FIRST_VISIT_SUCCESS = "first_visit_success"
    NEEDED_RETURN = "needed_return"


class CitizenRequest(StrictModel):
    """A row in 'My requests' (stored on the device)."""

    id: str
    procedure_id: str = Field(alias="procedureId")
    language: Lang
    created_at: dt.datetime = Field(alias="createdAt")
    updated_at: dt.datetime = Field(alias="updatedAt")
    status: RequestStatus = RequestStatus.EXPLORING
    checklist: dict[str, bool] = Field(default_factory=dict)
    form_id: str | None = Field(default=None, alias="formId")
    purpose: str | None = None
    filled_values: dict[str, str] = Field(default_factory=dict, alias="filledValues")
    visit_pack_code: str | None = Field(default=None, alias="visitPackCode")
    outcome: VisitOutcome = VisitOutcome.UNKNOWN


# ---------------------------------------------------------------------------
# Agent hand-offs (structured output for every LLM step)
# ---------------------------------------------------------------------------


class Intent(StrEnum):
    PROCEDURE_INFO = "procedure_info"
    CHECKLIST = "checklist"
    FORM = "form"
    OFFICE = "office"
    GREETING = "greeting"
    OUT_OF_SCOPE = "out_of_scope"


class RouteDecision(StrictModel):
    """Output of router_agent. Validated, then gated by deterministic code."""

    intent: Intent
    procedure_id: str | None = Field(
        default=None,
        alias="procedureId",
        description="MUST be one of the candidate ids given, or null.",
    )
    language: Lang = Field(description="Language to answer in.")
    input_variety: InputVariety = Field(alias="inputVariety")
    confidence: float = Field(ge=0, le=1)
    purpose: str | None = Field(
        default=None, description="Why the citizen needs it, in their own words, if stated."
    )
    reason: str = Field(max_length=300, description="Short justification, for the trace.")


class InfoAnswer(StrictModel):
    """Output of info_agent: plain-language text written only from record fields."""

    text: str = Field(min_length=1, max_length=1200)
    follow_up: str | None = Field(default=None, alias="followUp", max_length=200)


class PurposeText(StrictModel):
    """Output of the purpose-of-request writer (form fill)."""

    text: str = Field(min_length=1, max_length=160)
    language: Lang


# ---------------------------------------------------------------------------
# API contracts
# ---------------------------------------------------------------------------


class AskRequest(StrictModel):
    message: str = Field(min_length=1, max_length=1000)
    ui_language: Lang = Field(default=Lang.SI, alias="uiLanguage")
    session_id: str | None = Field(default=None, alias="sessionId", max_length=80)
    procedure_context: str | None = Field(
        default=None, alias="procedureContext", description="Procedure the user is currently viewing."
    )

    @field_validator("message")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("message is empty")
        return v


class TraceStep(StrictModel):
    agent: str
    label: str
    ms: int = Field(ge=0)
    detail: str | None = None


class SourceChip(StrictModel):
    title: str
    url: str | None = None
    verified_at: dt.date | None = Field(default=None, alias="verifiedAt")
    verified_by: str | None = Field(default=None, alias="verifiedBy")
    demo_data: bool = Field(alias="demoData")


class FactCard(StrictModel):
    """The Office · Fee · Time triple. Values come from the record, never the model."""

    office: str
    fee: str
    time: str
    is_free: bool = Field(alias="isFree")


class Candidate(StrictModel):
    procedure_id: str = Field(alias="procedureId")
    name: str
    score: float


class AnswerCard(StrictModel):
    kind: Literal["answer"] = "answer"
    procedure_id: str = Field(alias="procedureId")
    procedure_name: str = Field(alias="procedureName")
    text: str
    facts: FactCard
    source: SourceChip
    document_count: int = Field(alias="documentCount")
    has_form: bool = Field(alias="hasForm")
    grounded: bool = Field(description="True if the grounding guard accepted the model text.")


class DeclineCard(StrictModel):
    kind: Literal["decline"] = "decline"
    text: str
    reason: Literal["low_confidence", "out_of_scope", "unsafe", "error"]
    hotline: str = "1919"
    suggestions: list[Candidate] = Field(default_factory=list)


class GreetingCard(StrictModel):
    kind: Literal["greeting"] = "greeting"
    text: str


class AskResponse(StrictModel):
    session_id: str = Field(alias="sessionId")
    language: Lang
    input_variety: InputVariety = Field(alias="inputVariety")
    intent: Intent
    card: Annotated[AnswerCard | DeclineCard | GreetingCard, Field(discriminator="kind")]
    trace: list[TraceStep]
    mode: Literal["gemini", "offline"]
    latency_ms: int = Field(alias="latencyMs")
