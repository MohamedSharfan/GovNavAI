"""HTTP routes for the form pipeline (citizen fill + officer Form Studio)."""

from __future__ import annotations

import hmac
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import ValidationError

from govnav_agents.agents.deps import Deps
from govnav_agents.forms.agent import FormFillAgent
from govnav_agents.forms.overlay import FormFillError, render_filled_pdf
from govnav_agents.forms.planner import plan_fill
from govnav_agents.forms.studio import MAX_FORM_BYTES, Detector, FormDetection, detect_form, pdf_page_count
from govnav_agents.kb.repository import KnowledgeBaseError
from govnav_agents.paths import REPO_ROOT
from govnav_agents.schemas import FillPlan, FillPlanRequest, FormFillRequest, FormMap

log = logging.getLogger(__name__)
router = APIRouter()


def _deps(request: Request) -> Deps:
    d: Deps = request.app.state.deps
    return d


DepsDep = Annotated[Deps, Depends(_deps)]


def _form(d: Deps, form_id: str) -> FormMap:
    form = d.kb.get_form(form_id)
    if form is None or form.verification.status.value != "approved":
        raise HTTPException(status_code=404, detail="form not found")
    return form


def _pdf_bytes(form: FormMap) -> bytes:
    path = (REPO_ROOT / form.pdf_path).resolve()
    if REPO_ROOT.resolve() not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="form file missing")
    return path.read_bytes()


@router.get("/v1/forms")
async def list_forms(d: DepsDep) -> dict[str, Any]:
    items = [
        {
            "id": f.id,
            "code": f.code,
            "name": f.name.model_dump(),
            "procedureIds": f.procedure_ids,
            "pageCount": f.page_count,
        }
        for f in d.kb.forms()
        if f.verification.status.value == "approved"
    ]
    return {"items": items, "count": len(items)}


@router.get("/v1/forms/{form_id}")
async def get_form(form_id: str, d: DepsDep) -> dict[str, Any]:
    form = _form(d, form_id)
    return form.model_dump(by_alias=True, mode="json", exclude={"pdf_path"})


@router.get("/v1/forms/{form_id}/blank.pdf")
async def blank_pdf(form_id: str, d: DepsDep) -> Response:
    form = _form(d, form_id)
    return Response(
        _pdf_bytes(form),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{form.id}.pdf"',
            "Cache-Control": "public, max-age=86400",
        },
    )


@router.post("/v1/forms/{form_id}/plan", response_model=FillPlan, response_model_by_alias=True)
async def plan(form_id: str, body: FillPlanRequest, request: Request, d: DepsDep) -> FillPlan:
    """Map the citizen's on-device profile onto the form. Nothing is stored."""
    if not request.app.state.ask_limiter.allow(f"plan:{request.client.host if request.client else ''}"):
        raise HTTPException(status_code=429, detail="too many requests, please wait a moment")
    form = _form(d, form_id)
    agent: FormFillAgent = request.app.state.form_agent
    draft = await agent.draft(form, body.profile, lang=body.language, purpose_hint=body.purpose_hint)
    src = next((s for s in form.sources if s.id == form.verification.source_ref), None)
    return plan_fill(
        form,
        body.profile,
        lang=body.language,
        draft=draft,
        inputs=body.inputs,
        source_url=src.url if src else None,
    )


@router.post("/v1/forms/{form_id}/fill")
async def fill(form_id: str, body: FormFillRequest, d: DepsDep) -> Response:
    """Return the official form with the citizen-confirmed values printed on it."""
    form = _form(d, form_id)
    try:
        pdf = render_filled_pdf(form, _pdf_bytes(form), body.values)
    except FormFillError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return Response(
        pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{form.id}-filled.pdf"',
            "Cache-Control": "no-store",
        },
    )


# ---------------------------------------------------------------------------
# Officer: Form Studio
# ---------------------------------------------------------------------------


def require_officer(request: Request, x_officer_token: Annotated[str | None, Header()] = None) -> None:
    """Interim officer gate (shared secret). M3 replaces it with Firebase Google sign-in."""
    expected = request.app.state.deps.settings.officer_token
    if not expected:
        raise HTTPException(status_code=403, detail="officer console is not enabled")
    if not x_officer_token or not hmac.compare_digest(x_officer_token, expected):
        raise HTTPException(status_code=401, detail="officer sign-in required")


Officer = Annotated[None, Depends(require_officer)]


@router.post("/v1/officer/forms/detect", response_model=FormDetection, response_model_by_alias=True)
async def detect(
    request: Request,
    _: Officer,
    file: Annotated[UploadFile, File(description="Official form: PDF, JPEG or PNG")],
) -> FormDetection:
    data = await file.read(MAX_FORM_BYTES + 1)
    await file.close()
    detector: Detector | None = request.app.state.form_detector
    try:
        return await detect_form(data, detector)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from None
    except RuntimeError:
        raise HTTPException(status_code=503, detail="form_detection_unavailable") from None


@router.post("/v1/officer/forms/publish")
async def publish(
    request: Request,
    _: Officer,
    d: DepsDep,
    form_map: Annotated[str, Form(description="Reviewed form map JSON")],
    file: Annotated[UploadFile | None, File(description="Official PDF (required for a new form)")] = None,
) -> dict[str, Any]:
    """Publish an officer-reviewed form map. Nothing is live until an officer does this."""
    if d.settings.kb_backend != "local":
        raise HTTPException(status_code=501, detail="publishing to Firestore lands with the deploy milestone")
    try:
        form = FormMap.model_validate_json(form_map)
    except ValidationError as exc:
        errors = [{"loc": e["loc"], "msg": e["msg"]} for e in exc.errors()]
        raise HTTPException(status_code=422, detail=errors) from None
    if form.verification.status.value != "approved" or not form.verification.verified_by:
        raise HTTPException(status_code=422, detail="a named officer must approve the form map")
    pdf: bytes | None = None
    if file is not None:
        pdf = await file.read(MAX_FORM_BYTES + 1)
        await file.close()
        if pdf[:5] != b"%PDF-" or len(pdf) > MAX_FORM_BYTES:
            raise HTTPException(status_code=415, detail="the official form must be a PDF under 15 MB")
        if pdf_page_count(pdf) != form.page_count:
            raise HTTPException(status_code=422, detail="pageCount does not match the PDF")
    try:
        d.kb.publish_form(form, pdf)
    except KnowledgeBaseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    log.info("form %s published by officer (%d fields)", form.id, len(form.fields))
    return {"ok": True, "formId": form.id, "fields": len(form.fields)}


@router.post("/v1/officer/forms/validate")
async def validate_form_map(body: dict[str, Any], _: Officer, d: DepsDep) -> dict[str, Any]:
    """Check an edited form map against the schema and the knowledge base before publishing."""
    try:
        form = FormMap.model_validate(body)
    except ValidationError as exc:
        return {"ok": False, "errors": [{"loc": e["loc"], "msg": e["msg"]} for e in exc.errors()]}
    unknown = [p for p in form.procedure_ids if d.kb.get_procedure(p) is None]
    if unknown:
        return {"ok": False, "errors": [{"loc": ["procedureIds"], "msg": f"unknown procedures {unknown}"}]}
    return {"ok": True, "errors": [], "fields": len(form.fields)}
