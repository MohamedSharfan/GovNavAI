"""Print citizen-confirmed values onto an official PDF form.

Works on flat scanned forms (no AcroForm fields): each value is placed in its
reviewed, normalised bounding box from ``form_map.json``. Text is laid out with
MuPDF's HTML engine (HarfBuzz shaping), so Sinhala and Tamil conjuncts render
correctly, using embedded **Noto Sans Sinhala / Noto Sans Tamil** (SIL OFL, see
``fonts/OFL.txt``). Text shrinks to fit its box rather than overflowing onto
officer sections.
"""

from __future__ import annotations

import html
import re
from pathlib import Path

import pymupdf

from govnav_agents.schemas import FieldType, FillMode, FormField, FormMap

FONT_DIR = Path(__file__).parent / "fonts"
_SINHALA = re.compile(r"[඀-෿]")
_TAMIL = re.compile(r"[஀-௿]")
INK = "#0b2a6b"  # ballpoint blue, so printed values read as "filled in"

_CSS = """
@font-face { font-family: govsi; src: url(NotoSansSinhala.ttf); }
@font-face { font-family: govta; src: url(NotoSansTamil.ttf); }
* { margin: 0; padding: 0; color: %(ink)s; line-height: 1.25; }
.si { font-family: govsi, sans-serif; }
.ta { font-family: govta, sans-serif; }
.lat { font-family: govsi, sans-serif; letter-spacing: 0.2px; }
"""


class FormFillError(ValueError):
    """Raised when submitted values do not match the form map."""


def script_class(text: str) -> str:
    """Pick the font by the value's script (one family cannot shape all three)."""
    if _TAMIL.search(text):
        return "ta"
    if _SINHALA.search(text):
        return "si"
    return "lat"


def render_filled_pdf(form: FormMap, pdf_bytes: bytes, values: dict[str, str]) -> bytes:
    """Return a new PDF with ``values`` (field id → text) drawn on the official form.

    Only fields the citizen may fill are accepted; officer-only and signature fields
    are rejected so nothing is ever printed where an officer must write.
    """
    by_id: dict[str, FormField] = {f.id: f for f in form.fields}
    for fid in values:
        field = by_id.get(fid)
        if field is None:
            raise FormFillError(f"unknown field {fid!r}")
        if field.fill_mode in (FillMode.OFFICER, FillMode.MANUAL):
            raise FormFillError(f"field {fid!r} must be completed by hand")

    archive = pymupdf.Archive(str(FONT_DIR))
    css = _CSS % {"ink": INK}
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    try:
        if doc.page_count != form.page_count:
            raise FormFillError("PDF page count does not match the form map")
        for fid, raw in values.items():
            text = raw.strip()
            if not text:
                continue
            field = by_id[fid]
            if field.max_chars:
                text = text[: field.max_chars]
            page = doc[field.page]
            w, h = page.rect.width, page.rect.height
            b = field.bbox
            rect = pymupdf.Rect(b.x * w, b.y * h, (b.x + b.w) * w, (b.y + b.h) * h)
            size = field.font_size or 11.0
            body = html.escape(text).replace("\n", "<br/>")
            # Multi-line fields use the form's dotted-line spacing (~1.6 x the font size).
            leading = 1.6 if field.type is FieldType.MULTILINE else 1.25
            style = f"font-size:{size}px;line-height:{leading}"
            fragment = f'<div class="{script_class(text)}" style="{style}">{body}</div>'
            # scale_low lets long values shrink (down to 50%) instead of spilling over.
            spare, _scale = page.insert_htmlbox(rect, fragment, css=css, archive=archive, scale_low=0.5)
            if spare < 0:
                raise FormFillError(f"value for {fid!r} does not fit its box")
        doc.subset_fonts()  # embed only the glyphs used: ~MBs of Noto down to a few KB
        out: bytes = doc.tobytes(garbage=3, deflate=True)
        return out
    finally:
        doc.close()


def render_preview_png(pdf_bytes: bytes, page: int = 0, dpi: int = 110) -> bytes:
    """PNG of one page (used by tests and the review loop; the web app uses PDF.js)."""
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    try:
        png: bytes = doc[page].get_pixmap(dpi=dpi).tobytes("png")
        return png
    finally:
        doc.close()
