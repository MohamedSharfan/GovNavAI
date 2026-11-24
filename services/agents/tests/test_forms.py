"""Form pipeline: real income-certificate form map, planning, overlay, agent, API, Form Studio."""

from __future__ import annotations

import dataclasses
import datetime as dt
from collections.abc import Iterator

import pymupdf
import pytest
from fastapi.testclient import TestClient

from govnav_agents.agents.deps import Deps, build_deps
from govnav_agents.api.main import create_app
from govnav_agents.forms.agent import offline_draft
from govnav_agents.forms.overlay import FormFillError, render_filled_pdf, script_class
from govnav_agents.forms.planner import plan_fill
from govnav_agents.forms.studio import DetectedField, DetectionResult, to_form_fields
from govnav_agents.kb.repository import LocalKnowledgeBase
from govnav_agents.paths import REPO_ROOT
from govnav_agents.schemas import FillStatus, FormDraft, FormMap, Lang, Profile
from govnav_agents.settings import Settings

FORM_ID = "imbulpe-ds-income-certificate-request"
TODAY = dt.date(2026, 11, 24)

KUMARI = Profile.model_validate(
    {
        "fullNameEn": "KUMARI RATHNAYAKE",
        "fullNameSi": "රත්නායක මුදියන්සේලාගේ කුමාරි රත්නායක",
        "nic": "197462401987",
        "address": {"si": "නො. 42, පාර, කුරුවිට, රත්නපුර"},
        "confirmedKeys": ["fullNameSi", "nic", "address.si"],
    }
)


@pytest.fixture(scope="module")
def real_kb() -> LocalKnowledgeBase:
    return LocalKnowledgeBase()


@pytest.fixture(scope="module")
def form(real_kb: LocalKnowledgeBase) -> FormMap:
    f = real_kb.get_form(FORM_ID)
    assert f is not None
    return f


@pytest.fixture(scope="module")
def pdf_bytes(form: FormMap) -> bytes:
    return (REPO_ROOT / form.pdf_path).read_bytes()


def test_form_map_is_linked_and_sane(form: FormMap, real_kb: LocalKnowledgeBase) -> None:
    proc = real_kb.get_procedure("income-certificate")
    assert proc is not None and FORM_ID in proc.form_ids
    citizen = [f for f in form.fields if f.page == 0 and f.fill_mode.value != "officer"]
    assert {f.id for f in citizen} >= {"applicant-name", "address", "purpose", "date", "applicant-signature"}
    assert all(f.fill_mode.value == "officer" for f in form.fields if f.page == 1)


def test_plan_for_kumari(form: FormMap) -> None:
    plan = plan_fill(
        form,
        KUMARI,
        lang=Lang.SI,
        draft=FormDraft(purpose="දියණියගේ මහපොළ ශිෂ්‍යාධාර අයදුම්පත සඳහා"),
        inputs={"total-income": "35,000"},
        today=TODAY,
    )
    by = {f.id: f for f in plan.fields}
    assert (
        by["applicant-name"].value == KUMARI.full_name_si and by["applicant-name"].status is FillStatus.AUTO
    )
    assert by["date"].value == "2026.11.24"
    assert by["purpose"].status is FillStatus.CONFIRM
    assert by["applicant-signature"].status is FillStatus.MANUAL
    assert by["gn-recommendation"].status is FillStatus.OFFICER
    assert by["total-income"].source == "citizen"
    assert plan.manual_steps and "ග්‍රාම නිලධාරී" in plan.manual_steps[0].si
    # Everything except the hand signature is ready; optional sections are not counted.
    assert 85 <= plan.filled_pct < 100


def test_english_only_profile_needs_sinhala_name(form: FormMap) -> None:
    p = Profile.model_validate({"fullNameEn": "KUMARI RATHNAYAKE", "nic": "197462401987"})
    plan = plan_fill(form, p, lang=Lang.SI, today=TODAY)
    assert next(f for f in plan.fields if f.id == "applicant-name").status is FillStatus.MISSING
    suggested = plan_fill(form, p, lang=Lang.SI, draft=FormDraft(nameSi="කුමාරි රත්නායක"), today=TODAY)
    name = next(f for f in suggested.fields if f.id == "applicant-name")
    assert name.status is FillStatus.CONFIRM and name.source == "ai"


def test_overlay_writes_shaped_sinhala_text(form: FormMap, pdf_bytes: bytes) -> None:
    out = render_filled_pdf(
        form, pdf_bytes, {"applicant-name": KUMARI.full_name_si or "", "date": "2026.11.24"}
    )
    doc = pymupdf.open(stream=out, filetype="pdf")
    assert doc.page_count == 2
    assert "2026.11.24" in doc[0].get_text()
    # Blue "pen" ink must appear inside the name box (and not in the empty purpose box).
    page = doc[0]
    w, h = page.rect.width, page.rect.height

    def blue_pixels(field_id: str) -> int:
        b = next(f.bbox for f in form.fields if f.id == field_id)
        clip = pymupdf.Rect(b.x * w, b.y * h, (b.x + b.w) * w, (b.y + b.h) * h)
        pix = page.get_pixmap(dpi=100, clip=clip)
        data = pix.samples
        n = pix.n
        return sum(
            1 for i in range(0, len(data), n) if data[i + 2] > 90 and data[i] < 60 and data[i + 1] < 90
        )

    assert blue_pixels("applicant-name") > 150
    assert blue_pixels("purpose") == 0
    fonts = {f[3] for f in doc[0].get_fonts()}
    assert any("Noto Sans Sinhala" in f for f in fonts), fonts
    assert len(out) < 2_000_000  # fonts are subset


def test_overlay_refuses_officer_and_signature_fields(form: FormMap, pdf_bytes: bytes) -> None:
    for fid in ("gn-recommendation", "applicant-signature", "made-up"):
        with pytest.raises(FormFillError):
            render_filled_pdf(form, pdf_bytes, {fid: "x"})


def test_script_class() -> None:
    assert script_class("කුමාරි") == "si"
    assert script_class("குமாரி") == "ta"
    assert script_class("KUMARI 1974") == "lat"


@pytest.mark.parametrize(
    ("hint", "lang", "expected"),
    [
        ("mata income certificate ekak ona duwage scholarship ekata", "si", "දියණියගේ ශිෂ්‍යාධාර"),
        ("என் மகளின் புலமைப்பரிசிலுக்கு வேண்டும்", "ta", "மகளின் புலமைப்பரிசில்"),
        ("I need it for a bank loan", "en", "bank loan"),
        ("just need it", "si", None),
    ],
)
def test_offline_purpose_drafting(hint: str, lang: str, expected: str | None) -> None:
    system = f'<payload>\n{{"purpose_hint": "{hint}", "form_language": "{lang}"}}\n</payload>'
    out = offline_draft(system, "")
    if expected is None:
        assert out["purpose"] is None
    else:
        assert expected in out["purpose"]


# --- API ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def real_deps(real_kb: LocalKnowledgeBase) -> Deps:
    return build_deps(Settings(GOVNAV_LLM_MODE="offline", GOVNAV_OFFICER_TOKEN="test-officer"), real_kb)


@pytest.fixture
def client(real_deps: Deps) -> Iterator[TestClient]:
    with TestClient(create_app(real_deps)) as c:
        yield c


def test_api_plan_and_fill(client: TestClient) -> None:
    body = {
        "profile": KUMARI.model_dump(by_alias=True, mode="json"),
        "language": "si",
        "purposeHint": "mata income certificate ekak ona duwage scholarship ekata",
        "inputs": {"total-income": "35,000"},
    }
    r = client.post(f"/v1/forms/{FORM_ID}/plan", json=body)
    assert r.status_code == 200, r.text
    plan = r.json()
    purpose = next(f for f in plan["fields"] if f["id"] == "purpose")
    assert purpose["status"] == "confirm" and "ශිෂ්‍යාධාර" in purpose["value"]
    values = {f["id"]: f["value"] for f in plan["fields"] if f["value"]}
    pdf = client.post(f"/v1/forms/{FORM_ID}/fill", json={"values": values})
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["cache-control"] == "no-store"
    assert pdf.content[:5] == b"%PDF-"


def test_api_fill_rejects_officer_field(client: TestClient) -> None:
    r = client.post(f"/v1/forms/{FORM_ID}/fill", json={"values": {"ds-approval": "approved"}})
    assert r.status_code == 422


def test_blank_pdf_and_unknown_form(client: TestClient) -> None:
    assert client.get(f"/v1/forms/{FORM_ID}/blank.pdf").content[:5] == b"%PDF-"
    assert client.get("/v1/forms/nope").status_code == 404


def test_form_studio_requires_officer(client: TestClient, pdf_bytes: bytes) -> None:
    files = {"file": ("form.pdf", pdf_bytes, "application/pdf")}
    assert client.post("/v1/officer/forms/detect", files=files).status_code == 401
    r = client.post("/v1/officer/forms/detect", files=files, headers={"x-officer-token": "test-officer"})
    assert r.status_code == 503  # offline: detection needs Gemini


def test_form_studio_with_detector(real_deps: Deps, pdf_bytes: bytes) -> None:
    async def fake(pages: list[bytes]) -> DetectionResult:
        assert len(pages) == 2
        return DetectionResult(
            title_en="Income certificate request",
            title_si="ආදායම් සහතිකයක් ඉල්ලීම",
            title_ta="வருமானச் சான்றிதழ் கோரிக்கை",
            fields=[
                DetectedField(
                    number="01",
                    label_printed="ඉල්ලුම් කරුගේ නම",
                    label_en="Applicant name",
                    label_si="නම",
                    label_ta="பெயர்",
                    page=0,
                    box_2d=[190, 385, 226, 860],
                    type="text",
                    profile_key="fullName",
                    who_fills="citizen",
                ),
                DetectedField(
                    label_printed="අත්සන",
                    label_en="Signature",
                    label_si="අත්සන",
                    label_ta="கையொப்பம்",
                    page=0,
                    box_2d=[873, 565, 893, 655],
                    type="signature",
                    who_fills="citizen_by_hand",
                ),
            ],
        )

    with TestClient(create_app(real_deps)) as c:
        c.app.state.form_detector = fake  # type: ignore[attr-defined]
        r = c.post(
            "/v1/officer/forms/detect",
            files={"file": ("form.pdf", pdf_bytes, "application/pdf")},
            headers={"x-officer-token": "test-officer"},
        )
    assert r.status_code == 200, r.text
    fields = r.json()["fields"]
    assert fields[0]["bbox"] == {"x": 0.385, "y": 0.19, "w": 0.475, "h": 0.036}
    assert fields[0]["profileKey"] == "fullName"
    assert fields[1]["fillMode"] == "manual"


def test_detected_boxes_are_clamped_and_tiny_ones_dropped() -> None:
    res = DetectionResult(
        title_en="t",
        title_si="t",
        title_ta="t",
        fields=[
            DetectedField(
                label_printed="a",
                label_en="A",
                label_si="a",
                label_ta="a",
                page=0,
                box_2d=[-20, 100, 50, 1200],
                type="text",
                who_fills="officer",
            ),
            DetectedField(
                label_printed="b",
                label_en="B",
                label_si="b",
                label_ta="b",
                page=0,
                box_2d=[10, 10, 11, 12],
                type="text",
                who_fills="citizen",
            ),
            DetectedField(
                label_printed="c",
                label_en="C",
                label_si="c",
                label_ta="c",
                page=5,
                box_2d=[10, 10, 100, 100],
                type="text",
                who_fills="citizen",
            ),
        ],
    )
    fields = to_form_fields(res, page_count=2)
    assert len(fields) == 1
    assert fields[0].bbox.y == 0 and fields[0].bbox.x + fields[0].bbox.w == pytest.approx(1.0)


def _unused(d: Deps) -> Deps:  # keep dataclasses import meaningful for future fixtures
    return dataclasses.replace(d)


def test_publish_form_writes_map_and_links_procedure(tmp_path, pdf_bytes: bytes, form: FormMap) -> None:  # type: ignore[no-untyped-def]
    import shutil

    data = tmp_path / "data"
    shutil.copytree(REPO_ROOT / "data" / "procedures", data / "procedures")
    kb = LocalKnowledgeBase(data)
    deps = build_deps(Settings(GOVNAV_LLM_MODE="offline", GOVNAV_OFFICER_TOKEN="t"), kb)
    new = form.model_copy(update={"id": "kuruwita-income-request", "pdf_path": "x"})
    body = new.model_dump_json(by_alias=True)
    with TestClient(create_app(deps)) as c:
        h = {"x-officer-token": "t"}
        assert (
            c.post("/v1/officer/forms/publish", data={"form_map": body}, headers=h).status_code == 422
        )  # no PDF yet
        bad = c.post(
            "/v1/officer/forms/publish",
            data={"form_map": body},
            files={"file": ("f.pdf", b"not a pdf", "application/pdf")},
            headers=h,
        )
        assert bad.status_code == 415
        ok = c.post(
            "/v1/officer/forms/publish",
            data={"form_map": body},
            files={"file": ("f.pdf", pdf_bytes, "application/pdf")},
            headers=h,
        )
        assert ok.status_code == 200, ok.text
        assert c.get("/v1/forms/kuruwita-income-request").status_code == 200
    assert (data / "forms" / "kuruwita-income-request" / "form_map.json").exists()
    proc = kb.get_procedure("income-certificate")
    assert proc is not None and "kuruwita-income-request" in proc.form_ids
