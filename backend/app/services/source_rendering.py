from __future__ import annotations

import hashlib
import io
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import pdfplumber
from PIL import Image

from backend.app.services.loader import RegulatoryStore


RenderMode = Literal["crop", "page"]
RENDER_DPI = 180
VERTICAL_PADDING_POINTS = 24.0
HORIZONTAL_PADDING_POINTS = 8.0


class SourceEvidenceNotFoundError(LookupError):
    """The requested identifier is not part of the accepted evidence store."""


class SourceEvidenceCoordinatesError(ValueError):
    """The accepted evidence does not contain renderable coordinates."""


class SourceEvidenceUnavailableError(RuntimeError):
    """The accepted source snapshot cannot currently be rendered."""


@dataclass(frozen=True)
class RenderedSourceEvidence:
    content: bytes
    etag: str
    dataset_version: str
    source_document: str
    source_sha256: str
    reference_number: str
    pages: tuple[int, ...]
    render_mode: RenderMode
    dpi: int


def clamp_padded_bbox(
    table_bbox: list[float] | tuple[float, ...],
    row_bbox: list[float] | tuple[float, ...],
    page_width: float,
    page_height: float,
) -> tuple[float, float, float, float]:
    values = [*table_bbox, *row_bbox, page_width, page_height]
    if len(table_bbox) != 4 or len(row_bbox) != 4 or not all(
        isinstance(value, (int, float)) and math.isfinite(value) for value in values
    ):
        raise SourceEvidenceCoordinatesError("Accepted source coordinates are malformed")

    x0 = max(0.0, float(table_bbox[0]) - HORIZONTAL_PADDING_POINTS)
    y0 = max(0.0, float(row_bbox[1]) - VERTICAL_PADDING_POINTS)
    x1 = min(float(page_width), float(table_bbox[2]) + HORIZONTAL_PADDING_POINTS)
    y1 = min(float(page_height), float(row_bbox[3]) + VERTICAL_PADDING_POINTS)
    if x0 >= x1 or y0 >= y1:
        raise SourceEvidenceCoordinatesError("Accepted source coordinates are outside the page")
    return x0, y0, x1, y1


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render_cache_etag(
    dataset_version: str,
    source_sha256: str,
    raw_record_id: str,
    mode: RenderMode,
    dpi: int,
) -> str:
    identity = "|".join((dataset_version, source_sha256, raw_record_id, mode, str(dpi)))
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


def _compose(images: list[Image.Image]) -> Image.Image:
    if not images:
        raise SourceEvidenceCoordinatesError("Accepted source evidence has no renderable fragments")
    if len(images) == 1:
        return images[0]
    gap = 12
    width = max(image.width for image in images)
    height = sum(image.height for image in images) + gap * (len(images) - 1)
    combined = Image.new("RGB", (width, height), "white")
    y = 0
    for image in images:
        combined.paste(image, (0, y))
        y += image.height + gap
    return combined


class SourceEvidenceRenderer:
    def __init__(self, store: RegulatoryStore, dpi: int = RENDER_DPI):
        self.store = store
        self.dpi = dpi

    def render(self, raw_record_id: str, mode: RenderMode) -> RenderedSourceEvidence:
        raw = self.store.raw_by_id.get(raw_record_id)
        if raw is None:
            raise SourceEvidenceNotFoundError("Accepted source evidence record was not found")
        source_document = raw.get("source_document")
        source = self.store.source_documents_by_id.get(source_document)
        if source is None:
            raise SourceEvidenceUnavailableError("Accepted source document metadata is unavailable")
        return self._render_cached(
            self.store.dataset_version,
            source["sha256"],
            raw_record_id,
            mode,
            self.dpi,
        )

    @lru_cache(maxsize=128)
    def _render_cached(
        self,
        dataset_version: str,
        source_sha256: str,
        raw_record_id: str,
        mode: RenderMode,
        dpi: int,
    ) -> RenderedSourceEvidence:
        raw = self.store.raw_by_id[raw_record_id]
        source_document = raw["source_document"]
        source = self.store.source_documents_by_id[source_document]
        sources_root = (self.store.root / "data_pipeline" / "Sources").resolve()
        source_path = (sources_root / source["filename"]).resolve()
        if source_path.parent != sources_root or not source_path.is_file():
            raise SourceEvidenceUnavailableError("Accepted source PDF is unavailable")
        if _sha256(source_path) != source_sha256:
            raise SourceEvidenceUnavailableError("Accepted source PDF failed integrity verification")

        fragments = raw.get("fragments") or []
        if not fragments:
            raise SourceEvidenceCoordinatesError("Accepted source evidence has no page fragments")

        images: list[Image.Image] = []
        pages: list[int] = []
        try:
            with pdfplumber.open(source_path) as pdf:
                for fragment in fragments:
                    page_number = fragment.get("source_page")
                    if not isinstance(page_number, int) or page_number < 1 or page_number > len(pdf.pages):
                        raise SourceEvidenceCoordinatesError("Accepted source page is invalid")
                    page = pdf.pages[page_number - 1]
                    if mode == "crop":
                        bbox = clamp_padded_bbox(
                            fragment.get("table_bbox") or [],
                            fragment.get("row_bbox") or [],
                            float(page.width),
                            float(page.height),
                        )
                        image = page.crop(bbox).to_image(resolution=dpi, antialias=True).original
                    else:
                        image = page.to_image(resolution=dpi, antialias=True).original
                    images.append(image.convert("RGB"))
                    pages.append(page_number)
        except SourceEvidenceCoordinatesError:
            raise
        except Exception as error:
            raise SourceEvidenceUnavailableError("Accepted source PDF could not be rendered") from error

        output = io.BytesIO()
        _compose(images).save(output, format="PNG", optimize=True)
        etag = render_cache_etag(dataset_version, source_sha256, raw_record_id, mode, dpi)
        return RenderedSourceEvidence(
            content=output.getvalue(),
            etag=etag,
            dataset_version=dataset_version,
            source_document=source_document,
            source_sha256=source_sha256,
            reference_number=str(raw.get("reference_number") or ""),
            pages=tuple(pages),
            render_mode=mode,
            dpi=dpi,
        )
