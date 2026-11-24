"""HTTP hardening: security headers, body-size limit, rate limiting, log redaction."""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from govnav_agents.sl.formats import redact

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject oversized bodies early (uploads use their own, larger limit per route)."""

    def __init__(self, app: ASGIApp, max_bytes: int = 64 * 1024, upload_max_bytes: int = 16 * 1024 * 1024):
        super().__init__(app)
        self.max_bytes = max_bytes
        self.upload_max_bytes = upload_max_bytes

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        is_upload = "/uploads/" in path or path.startswith("/v1/officer/forms/")
        limit = self.upload_max_bytes if is_upload else self.max_bytes
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > limit:
            return JSONResponse({"detail": "request too large"}, status_code=413)
        return await call_next(request)


@dataclass
class _Bucket:
    tokens: float
    updated: float = field(default_factory=time.monotonic)


class RateLimiter:
    """Per-key token bucket. In-memory: one Cloud Run instance's view, which is
    enough to blunt abuse of the Gemini quota. Cloud Armor handles edge limits."""

    def __init__(self, rate_per_min: float, burst: int) -> None:
        self.rate = rate_per_min / 60.0
        self.burst = float(burst)
        self._buckets: dict[str, _Bucket] = defaultdict(lambda: _Bucket(tokens=self.burst))

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        b = self._buckets[key]
        b.tokens = min(self.burst, b.tokens + (now - b.updated) * self.rate)
        b.updated = now
        if b.tokens >= 1:
            b.tokens -= 1
            return True
        return False


def client_key(request: Request) -> str:
    # Cloud Run sets X-Forwarded-For; the left-most entry is the client.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RedactingFilter(logging.Filter):
    """Strip NIC numbers, phone numbers and e-mails from every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # never let logging crash a request
            return True
        record.msg = redact(message)
        record.args = ()
        return True


def configure_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    handler.addFilter(RedactingFilter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    for noisy in ("httpx", "google_genai", "google.adk"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
