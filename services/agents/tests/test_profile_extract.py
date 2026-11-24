"""Profile-from-documents: validation of model output and the upload endpoint."""

from __future__ import annotations

import dataclasses
import datetime as dt
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from govnav_agents.agents.deps import Deps
from govnav_agents.api.main import create_app
from govnav_agents.profile.extract import InvalidImageError, sniff_image, validate_extraction
from govnav_agents.schemas import DocumentExtraction, DocumentType

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
TODAY = dt.date(2026, 11, 24)


def _raw(**kw: object) -> DocumentExtraction:
    base: dict[str, object] = {"documentType": "nic_new", "legibility": 0.9}
    base.update(kw)
    return DocumentExtraction.model_validate(base)


def test_nic_derives_dob_and_gender_and_caps_name() -> None:
    res = validate_extraction(
        _raw(fullNameEn="Kumari Rathnayake", nic="197462401987", dateOfBirth="1974.05.03"), today=TODAY
    )
    got = {f.key: f for f in res.fields}
    assert got["fullNameEn"].value == "KUMARI RATHNAYAKE"
    assert got["nic"].value == "197462401987"
    assert got["dateOfBirth"].value == "1974-05-03"
    assert got["dateOfBirth"].source == "derived"
    assert got["gender"].value == "female"
    assert res.warnings == []
    assert res.image_retained is False


def test_printed_dob_mismatch_is_flagged() -> None:
    res = validate_extraction(_raw(nic="197462401987", dateOfBirth="1974.06.03"), today=TODAY)
    assert "printed_dob_differs_from_nic" in res.warnings


def test_invalid_nic_is_dropped_not_guessed() -> None:
    res = validate_extraction(_raw(nic="19746240198"), today=TODAY)
    assert "nic_invalid" in res.warnings
    assert all(f.key != "nic" for f in res.fields)


def test_bill_uses_account_holder_and_flags_blurry_photo() -> None:
    res = validate_extraction(
        _raw(
            documentType="utility_bill",
            accountHolder="K. Rathnayake",
            addressSi="නො. 42, කුරුවිට",
            legibility=0.2,
        )
    )
    assert res.document_type is DocumentType.UTILITY_BILL
    keys = {f.key: f.value for f in res.fields}
    assert keys["fullNameEn"] == "K. RATHNAYAKE"
    assert keys["address.si"] == "නො. 42, කුරුවිට"
    assert "photo_unclear" in res.warnings


@pytest.mark.parametrize("data", [b"", b"%PDF-1.7 not an image", b"GIF89a....."])
def test_sniff_rejects_non_images(data: bytes) -> None:
    with pytest.raises(InvalidImageError):
        sniff_image(data)


@pytest.fixture
def client(deps: Deps) -> Iterator[TestClient]:
    with TestClient(create_app(deps)) as c:
        yield c


def test_endpoint_offline_returns_503(client: TestClient) -> None:
    r = client.post("/v1/uploads/profile-extract", files={"photo": ("nic.jpg", JPEG, "image/jpeg")})
    assert r.status_code == 503
    assert r.json()["detail"] == "photo_reading_unavailable"


def test_endpoint_rejects_spoofed_content_type(client: TestClient) -> None:
    r = client.post("/v1/uploads/profile-extract", files={"photo": ("x.jpg", b"<script>", "image/jpeg")})
    assert r.status_code == 415


def test_endpoint_with_vision_model(deps: Deps) -> None:
    async def fake(image: bytes, mime: str) -> DocumentExtraction:
        assert mime == "image/jpeg"
        return _raw(fullNameEn="Kumari Rathnayake", nic="197462401987")

    with TestClient(create_app(dataclasses.replace(deps, vision=fake))) as c:
        r = c.post("/v1/uploads/profile-extract", files={"photo": ("nic.jpg", JPEG, "image/jpeg")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["imageRetained"] is False
    assert {f["key"] for f in body["fields"]} >= {"fullNameEn", "nic", "dateOfBirth", "gender"}
