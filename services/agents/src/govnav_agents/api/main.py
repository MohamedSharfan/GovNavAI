"""FastAPI application for the GovNavAI agent service (Cloud Run)."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from govnav_agents import __version__
from govnav_agents.agents.deps import Deps, build_deps
from govnav_agents.agents.labels import office_label
from govnav_agents.agents.service import AskService
from govnav_agents.api.security import (
    BodySizeLimitMiddleware,
    RateLimiter,
    SecurityHeadersMiddleware,
    client_key,
    configure_logging,
)
from govnav_agents.schemas import AskRequest, AskResponse, Lang, OfficeType, Procedure
from govnav_agents.settings import get_settings

log = logging.getLogger("govnav.api")


def _procedure_summary(p: Procedure) -> dict[str, Any]:
    return {
        "id": p.id,
        "category": p.category.value,
        "name": p.name.model_dump(),
        "summary": p.summary.model_dump(),
        "officeType": p.office_type.value,
        "office": {lang.value: office_label(p.office_type, lang) for lang in Lang},
        "fee": p.fee.text.model_dump(),
        "isFree": p.fee.is_free,
        "processingTime": p.processing_time.text.model_dump(),
        "documentCount": len(p.required_documents),
        "hasForm": bool(p.form_ids),
        "demoData": p.verification.demo_data,
        "verifiedAt": p.verification.verified_at.isoformat() if p.verification.verified_at else None,
    }


def _get_deps(request: Request) -> Deps:
    d: Deps = request.app.state.deps
    return d


DepsDep = Annotated[Deps, Depends(_get_deps)]


def create_app(deps: Deps | None = None) -> FastAPI:
    settings = deps.settings if deps else get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        d = deps or build_deps(settings)
        app.state.deps = d
        app.state.ask = AskService(d)
        app.state.ask_limiter = RateLimiter(rate_per_min=20, burst=8)
        log.info("GovNavAI agent service %s ready (mode=%s)", __version__, d.mode)
        yield

    app = FastAPI(
        title="GovNavAI agent service",
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url=None,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["content-type", "authorization", "x-firebase-appcheck"],
        max_age=600,
    )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Echo field locations only, never submitted values (may contain personal data).
        errors = [{"loc": e.get("loc"), "msg": e.get("msg")} for e in exc.errors()]
        return JSONResponse({"detail": errors}, status_code=422)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error: %s", type(exc).__name__)
        return JSONResponse({"detail": "internal error"}, status_code=500)

    @app.get("/healthz")
    async def healthz(d: DepsDep) -> dict[str, Any]:
        return {
            "ok": True,
            "version": __version__,
            "mode": d.mode,
            "procedures": len(d.kb.procedures()),
            "offices": len(d.kb.offices()),
            "embedder": d.retriever.embedder.model_id,
        }

    @app.post("/v1/ask", response_model=AskResponse, response_model_by_alias=True)
    async def ask(body: AskRequest, request: Request) -> AskResponse:
        if not request.app.state.ask_limiter.allow(client_key(request)):
            raise HTTPException(status_code=429, detail="too many requests, please wait a moment")
        service: AskService = request.app.state.ask
        return await service.ask(body)

    @app.get("/v1/procedures")
    async def list_procedures(d: DepsDep) -> dict[str, Any]:
        items = sorted(d.kb.procedures(), key=lambda p: (p.category.value, p.id))
        return {"items": [_procedure_summary(p) for p in items], "count": len(items)}

    @app.get("/v1/procedures/{procedure_id}")
    async def get_procedure(procedure_id: str, d: DepsDep) -> dict[str, Any]:
        p = d.kb.get_procedure(procedure_id)
        if p is None:
            raise HTTPException(status_code=404, detail="procedure not found")
        offices = [o.id for o, _ in d.kb.offices_for(procedure_id)]
        return {
            "procedure": p.model_dump(by_alias=True, mode="json"),
            "summary": _procedure_summary(p),
            "officeIds": offices,
        }

    @app.get("/v1/offices")
    async def list_offices(
        d: DepsDep,
        procedure_id: Annotated[str | None, Query(alias="procedureId", max_length=64)] = None,
        office_type: Annotated[OfficeType | None, Query(alias="type")] = None,
        lat: Annotated[float | None, Query(ge=5.5, le=10.0)] = None,
        lng: Annotated[float | None, Query(ge=79.4, le=82.0)] = None,
    ) -> dict[str, Any]:
        near = (lat, lng) if lat is not None and lng is not None else None
        rows = d.kb.offices_for(procedure_id, office_type=office_type, near=near)
        return {
            "items": [
                {**o.model_dump(by_alias=True, mode="json"), "distanceKm": round(km, 1) if km else None}
                for o, km in rows
            ],
            "count": len(rows),
        }

    @app.get("/v1/offices/{office_id}")
    async def get_office(office_id: str, d: DepsDep) -> dict[str, Any]:
        o = d.kb.get_office(office_id)
        if o is None:
            raise HTTPException(status_code=404, detail="office not found")
        return o.model_dump(by_alias=True, mode="json")

    @app.get("/v1/geo")
    async def geo(d: DepsDep) -> dict[str, Any]:
        return {"districts": [x.model_dump(by_alias=True, mode="json") for x in d.kb.districts()]}

    return app


def run() -> None:
    """Console entry point: ``uv run govnav-api``."""
    configure_logging()
    settings = get_settings()
    uvicorn.run(
        "govnav_agents.api.main:create_app",
        factory=True,
        host="0.0.0.0",  # noqa: S104 - container entry point
        port=settings.port,
        log_config=None,
        proxy_headers=True,
    )
