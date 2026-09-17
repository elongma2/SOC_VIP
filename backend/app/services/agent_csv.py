from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from pathlib import Path


MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_ROWS = 500
MAX_COLUMNS = 50
MAX_CELL_CHARACTERS = 8_192
MAX_DECODED_CHARACTERS = 250_000


class CSVUploadError(ValueError):
    def __init__(self, code: str, message: str, status_code: int = 422):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class ParsedCSV:
    filename: str
    delimiter: str
    rows: tuple[tuple[str, ...], ...]


def _decode_csv(content: bytes) -> str:
    encoding = "utf-16" if content.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
    try:
        text = content.decode(encoding)
    except UnicodeDecodeError as error:
        raise CSVUploadError(
            "agent_csv_encoding_unsupported",
            "CSV must be UTF-8, UTF-8 with BOM, or BOM-identified UTF-16 text",
        ) from error
    if len(text) > MAX_DECODED_CHARACTERS:
        raise CSVUploadError("agent_csv_too_large", "Decoded CSV exceeds 250,000 characters", 413)
    return text


def parse_csv_upload(filename: str, content: bytes) -> ParsedCSV:
    safe_name = Path(filename or "formulation.csv").name
    if Path(safe_name).suffix.casefold() != ".csv":
        raise CSVUploadError("agent_csv_type_unsupported", "Only .csv formulation files are supported")
    if not content:
        raise CSVUploadError("agent_csv_empty", "The uploaded CSV is empty")
    if len(content) > MAX_FILE_BYTES:
        raise CSVUploadError("agent_csv_too_large", "CSV files are limited to 2 MiB", 413)
    text = _decode_csv(content)
    if not text.strip():
        raise CSVUploadError("agent_csv_empty", "The uploaded CSV contains no data")
    try:
        dialect = csv.Sniffer().sniff(text[:16_384], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    try:
        rows = [tuple(row) for row in csv.reader(io.StringIO(text), dialect, strict=True)]
    except csv.Error as error:
        raise CSVUploadError("agent_csv_malformed", f"CSV could not be parsed: {error}") from error
    if not any(any(cell.strip() for cell in row) for row in rows):
        raise CSVUploadError("agent_csv_empty", "The uploaded CSV contains no non-empty rows")
    if len(rows) > MAX_ROWS:
        raise CSVUploadError("agent_csv_too_many_rows", f"CSV files are limited to {MAX_ROWS} rows")
    if max(len(row) for row in rows) > MAX_COLUMNS:
        raise CSVUploadError("agent_csv_too_many_columns", f"CSV files are limited to {MAX_COLUMNS} columns")
    if any(len(cell) > MAX_CELL_CHARACTERS for row in rows for cell in row):
        raise CSVUploadError("agent_csv_cell_too_large", f"CSV cells are limited to {MAX_CELL_CHARACTERS} characters")
    return ParsedCSV(filename=safe_name, delimiter=dialect.delimiter, rows=tuple(rows))
