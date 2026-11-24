"""Runtime settings (environment / .env). Model IDs live in :mod:`govnav_agents.llm.models`."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from govnav_agents.paths import REPO_ROOT


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    llm_mode: Literal["auto", "gemini", "offline"] = Field(default="auto", alias="GOVNAV_LLM_MODE")
    kb_backend: Literal["local", "firestore"] = Field(default="local", alias="GOVNAV_KB_BACKEND")
    retrieval_threshold: float = Field(default=0.45, ge=0, le=1, alias="GOVNAV_RETRIEVAL_THRESHOLD")
    cors_origins: str = Field(default="http://localhost:3000", alias="GOVNAV_CORS_ORIGINS")
    google_cloud_project: str | None = Field(default=None, alias="GOOGLE_CLOUD_PROJECT")
    google_cloud_location: str = Field(default="asia-south1", alias="GOOGLE_CLOUD_LOCATION")
    officer_emails: str = Field(default="", alias="GOVNAV_OFFICER_EMAILS")
    officer_token: str | None = Field(default=None, alias="GOVNAV_OFFICER_TOKEN")
    port: int = Field(default=8080, alias="PORT")

    @property
    def effective_llm_mode(self) -> Literal["gemini", "offline"]:
        if self.llm_mode == "auto":
            return "gemini" if self.gemini_api_key else "offline"
        return self.llm_mode

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
