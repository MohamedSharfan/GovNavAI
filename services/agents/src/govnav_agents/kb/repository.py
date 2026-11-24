"""Knowledge-base repository: the only way agents read procedures, offices and forms.

Two back-ends share one interface:

* :class:`LocalKnowledgeBase` reads the reviewed JSON files in ``data/``. Used for
  dev, CI, evals and as the seed source for Firestore.
* ``FirestoreKnowledgeBase`` (see :mod:`govnav_agents.kb.firestore`) serves the
  live, officer-approved records in production.

Only records whose ``verification.status`` is ``approved`` are served to citizens.
"""

from __future__ import annotations

import json
import logging
import math
from collections.abc import Iterable
from pathlib import Path
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from govnav_agents.paths import DATA_DIR
from govnav_agents.schemas import (
    District,
    FormMap,
    Office,
    OfficeType,
    Procedure,
    QueueStatus,
    RecordStatus,
)

log = logging.getLogger(__name__)
M = TypeVar("M", bound=BaseModel)


class KnowledgeBaseError(RuntimeError):
    """Raised when seed data is invalid or inconsistent."""


class KnowledgeBase(Protocol):
    def procedures(self, *, include_drafts: bool = False) -> list[Procedure]: ...
    def get_procedure(self, procedure_id: str) -> Procedure | None: ...
    def offices(self) -> list[Office]: ...
    def get_office(self, office_id: str) -> Office | None: ...
    def forms(self) -> list[FormMap]: ...
    def get_form(self, form_id: str) -> FormMap | None: ...
    def districts(self) -> list[District]: ...


def _load_dir(directory: Path, model: type[M]) -> list[M]:
    items: list[M] = []
    if not directory.exists():
        return items
    for path in sorted(directory.glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise KnowledgeBaseError(f"{path}: invalid JSON: {exc}") from exc
        records = raw if isinstance(raw, list) else [raw]
        for i, rec in enumerate(records):
            try:
                items.append(model.model_validate(rec))
            except ValidationError as exc:
                raise KnowledgeBaseError(f"{path}[{i}]: {exc}") from exc
    return items


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in kilometres."""
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class LocalKnowledgeBase:
    """Knowledge base backed by the JSON files in ``data/``."""

    def __init__(self, data_dir: Path = DATA_DIR) -> None:
        self.data_dir = data_dir
        self._procedures = {p.id: p for p in _load_dir(data_dir / "procedures", Procedure)}
        self._offices = {o.id: o for o in _load_dir(data_dir / "offices", Office)}
        self._forms = {f.id: f for f in self._load_forms(data_dir / "forms")}
        self._districts = _load_dir(data_dir / "geo", District)
        self.validate_references()

    @staticmethod
    def _load_forms(forms_dir: Path) -> list[FormMap]:
        # Each form lives in data/forms/<form-id>/form_map.json next to its PDF.
        maps: list[FormMap] = []
        if not forms_dir.exists():
            return maps
        for path in sorted(forms_dir.glob("*/form_map.json")):
            try:
                maps.append(FormMap.model_validate_json(path.read_text(encoding="utf-8")))
            except ValidationError as exc:
                raise KnowledgeBaseError(f"{path}: {exc}") from exc
        return maps

    def validate_references(self) -> list[str]:
        """Check cross-record references. Returns warnings; raises on hard errors."""
        warnings: list[str] = []
        for p in self._procedures.values():
            for fid in p.form_ids:
                if fid not in self._forms:
                    warnings.append(f"procedure {p.id}: form {fid!r} has no form_map yet")
            for doc in p.required_documents:
                if doc.form_id and doc.form_id not in self._forms:
                    warnings.append(f"procedure {p.id}: document {doc.id} form {doc.form_id!r} missing")
        for o in self._offices.values():
            unknown = [h for h in o.handles if h not in self._procedures]
            if unknown:
                raise KnowledgeBaseError(f"office {o.id} handles unknown procedures {unknown}")
        for f in self._forms.values():
            unknown = [pid for pid in f.procedure_ids if pid not in self._procedures]
            if unknown:
                raise KnowledgeBaseError(f"form {f.id} references unknown procedures {unknown}")
        for w in warnings:
            log.warning(w)
        return warnings

    # -- procedures -----------------------------------------------------------------
    def procedures(self, *, include_drafts: bool = False) -> list[Procedure]:
        return [
            p
            for p in self._procedures.values()
            if include_drafts or p.verification.status is RecordStatus.APPROVED
        ]

    def get_procedure(self, procedure_id: str) -> Procedure | None:
        p = self._procedures.get(procedure_id)
        if p is None or p.verification.status is not RecordStatus.APPROVED:
            return None
        return p

    # -- offices --------------------------------------------------------------------
    def offices(self) -> list[Office]:
        return list(self._offices.values())

    def get_office(self, office_id: str) -> Office | None:
        return self._offices.get(office_id)

    def offices_for(
        self,
        procedure_id: str | None = None,
        *,
        office_type: OfficeType | None = None,
        near: tuple[float, float] | None = None,
    ) -> list[tuple[Office, float | None]]:
        """Offices filtered by procedure/type, sorted by distance when ``near`` is given."""
        rows: Iterable[Office] = self._offices.values()
        if procedure_id:
            rows = [o for o in rows if procedure_id in o.handles]
        if office_type:
            rows = [o for o in rows if o.type is office_type]
        out = [
            (o, haversine_km(near[0], near[1], o.location.lat, o.location.lng) if near else None)
            for o in rows
        ]
        out.sort(key=lambda t: (t[1] if t[1] is not None else 0.0, t[0].type.value))
        return out

    def set_queue_status(self, office_id: str, status: str) -> Office:
        office = self._offices.get(office_id)
        if office is None:
            raise KeyError(office_id)
        updated = office.model_copy(update={"queue_status": QueueStatus(status)})
        self._offices[office_id] = updated
        return updated

    # -- forms / geo ----------------------------------------------------------------
    def forms(self) -> list[FormMap]:
        return list(self._forms.values())

    def get_form(self, form_id: str) -> FormMap | None:
        return self._forms.get(form_id)

    def districts(self) -> list[District]:
        return list(self._districts)

    def publish_form(self, form: FormMap, pdf: bytes | None) -> Path:
        """Officer-approved form map (and PDF) → data/forms/<id>/, live immediately."""
        unknown = [p for p in form.procedure_ids if p not in self._procedures]
        if unknown:
            raise KnowledgeBaseError(f"unknown procedures {unknown}")
        folder = self.data_dir / "forms" / form.id
        folder.mkdir(parents=True, exist_ok=True)
        if pdf is not None:
            (folder / "official.pdf").write_bytes(pdf)
        elif not (folder / "official.pdf").exists():
            raise KnowledgeBaseError("a new form needs its official PDF")
        stored = form.model_copy(update={"pdf_path": f"data/forms/{form.id}/official.pdf"})
        path = folder / "form_map.json"
        text = stored.model_dump_json(by_alias=True, indent=2, exclude_none=True)
        path.write_text(text + chr(10), encoding="utf-8")
        self._forms[form.id] = stored
        for pid in form.procedure_ids:
            proc = self._procedures[pid]
            if form.id not in proc.form_ids:
                self._procedures[pid] = proc.model_copy(update={"form_ids": [*proc.form_ids, form.id]})
        return path
