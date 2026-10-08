from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from pathlib import Path

import openpyxl
import xlrd
from pypdf import PdfReader


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


def parse_formulation_upload(filename: str, content: bytes) -> ParsedCSV:
    safe_name = Path(filename or "formulation.csv").name
    suffix = Path(safe_name).suffix.casefold()
    if suffix not in {".csv", ".tsv", ".txt", ".xlsx", ".xls", ".json", ".pdf"}:
        raise CSVUploadError("agent_csv_type_unsupported", "Supported formulation files: .csv, .tsv, .txt, .xlsx, .xls, .json, and .pdf")
    if not content:
        raise CSVUploadError("agent_csv_empty", "The uploaded CSV is empty")
    if len(content) > MAX_FILE_BYTES:
        raise CSVUploadError("agent_csv_too_large", "CSV files are limited to 2 MiB", 413)
    if suffix == ".xlsx":
        workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        rows = [tuple("" if value is None else str(value) for value in row) for row in next(iter(workbook.worksheets)).iter_rows(values_only=True)]
        return _validate_rows(safe_name, rows, "\t")
    if suffix == ".xls":
        sheet = xlrd.open_workbook(file_contents=content, on_demand=True).sheet_by_index(0)
        rows = [tuple(str(value) for value in sheet.row_values(index)) for index in range(sheet.nrows)]
        return _validate_rows(safe_name, rows, "\t")
    if suffix == ".json":
        try:
            payload = json.loads(content.decode("utf-8-sig"))
            records = payload if isinstance(payload, list) else payload.get("rows") if isinstance(payload, dict) else None
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise CSVUploadError("agent_csv_malformed", "JSON could not be parsed") from error
        if not isinstance(records, list):
            raise CSVUploadError("agent_csv_malformed", "JSON must contain an array of rows or an object with a rows array")
        rows = [tuple(str(value) if value is not None else "" for value in row) for row in records if isinstance(row, list)]
        return _validate_rows(safe_name, rows, "\t")
    if suffix == ".pdf":
        text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(content)).pages)
    else:
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
        raise CSVUploadError("agent_csv_too_many_rows", f"Files are limited to {MAX_ROWS} rows")
    if max(len(row) for row in rows) > MAX_COLUMNS:
        raise CSVUploadError("agent_csv_too_many_columns", f"CSV files are limited to {MAX_COLUMNS} columns")
    if any(len(cell) > MAX_CELL_CHARACTERS for row in rows for cell in row):
        raise CSVUploadError("agent_csv_cell_too_large", f"CSV cells are limited to {MAX_CELL_CHARACTERS} characters")
    return ParsedCSV(filename=safe_name, delimiter=dialect.delimiter, rows=tuple(rows))


def _validate_rows(filename: str, rows: list[tuple[str, ...]], delimiter: str) -> ParsedCSV:
    if not rows or not any(any(cell.strip() for cell in row) for row in rows):
        raise CSVUploadError("agent_csv_empty", "The uploaded file contains no data")
    if len(rows) > MAX_ROWS or max(len(row) for row in rows) > MAX_COLUMNS:
        raise CSVUploadError("agent_csv_shape_invalid", "The uploaded file exceeds the row or column limits")
    return ParsedCSV(filename=filename, delimiter=delimiter, rows=tuple(rows))


parse_csv_upload = parse_formulation_upload
