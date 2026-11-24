from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from govnav_agents.agents.deps import Deps
from govnav_agents.api.main import create_app


@pytest.fixture
def client(deps: Deps) -> Iterator[TestClient]:
    with TestClient(create_app(deps)) as c:
        yield c


def test_health(client: TestClient) -> None:
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "offline"
    assert body["procedures"] == 2
    assert r.headers["x-content-type-options"] == "nosniff"


def test_ask_answer_shape(client: TestClient) -> None:
    r = client.post("/v1/ask", json={"message": "mata income certificate ekak ona"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["card"]["kind"] == "answer"
    assert body["card"]["procedureId"] == "income-certificate"
    assert body["card"]["facts"]["isFree"] is True
    assert body["card"]["source"]["demoData"] is True
    assert body["inputVariety"] == "singlish"
    assert body["sessionId"]


def test_ask_validation_does_not_echo_input(client: TestClient) -> None:
    r = client.post("/v1/ask", json={"message": "", "uiLanguage": "xx"})
    assert r.status_code == 422
    assert "xx" not in r.text


def test_ask_rejects_oversized_body(client: TestClient) -> None:
    r = client.post("/v1/ask", content=b"x" * 70_000, headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_ask_rate_limited(client: TestClient) -> None:
    codes = [client.post("/v1/ask", json={"message": "hello"}).status_code for _ in range(12)]
    assert 429 in codes


def test_procedures(client: TestClient) -> None:
    r = client.get("/v1/procedures")
    assert r.status_code == 200
    ids = {p["id"] for p in r.json()["items"]}
    assert ids == {"income-certificate", "birth-certificate-copy"}
    detail = client.get("/v1/procedures/income-certificate").json()
    assert detail["procedure"]["verification"]["verifiedBy"] == "Test Officer"
    assert client.get("/v1/procedures/nope").status_code == 404
