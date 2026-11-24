"""Export the Pydantic schemas to JSON Schema for ``packages/shared``.

Run: ``uv run python -m govnav_agents.scripts.export_schemas``
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel

from govnav_agents import schemas
from govnav_agents.paths import REPO_ROOT

OUT_DIR = REPO_ROOT / "packages" / "shared" / "schemas"

EXPORTED: tuple[type[BaseModel], ...] = (
    schemas.Procedure,
    schemas.Office,
    schemas.District,
    schemas.FormMap,
    schemas.Profile,
    schemas.CitizenRequest,
    schemas.RouteDecision,
    schemas.AskRequest,
    schemas.AskResponse,
)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for model in EXPORTED:
        schema = model.model_json_schema(by_alias=True, mode="serialization")
        path: Path = OUT_DIR / f"{model.__name__}.schema.json"
        path.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
