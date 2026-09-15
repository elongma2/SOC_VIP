#!/usr/bin/env python3
"""Create the synthetic client-document bundle used by the clickable UI."""

from __future__ import annotations

import argparse
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


PAGE_W, PAGE_H = A4
NAVY = colors.HexColor("#102D47")
TEAL = colors.HexColor("#0F7478")
MUTED = colors.HexColor("#66758A")
LIGHT = colors.HexColor("#EDF2F4")
LINE = colors.HexColor("#D4DDE3")
CORAL_BG = colors.HexColor("#FAE0D9")
CORAL = colors.HexColor("#A64136")
AMBER_BG = colors.HexColor("#FFF0CC")
PAPER = colors.HexColor("#F7F4EE")


def header(pdf: canvas.Canvas, document_title: str, page_number: int) -> float:
    pdf.setFillColor(PAPER)
    pdf.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    pdf.setFillColor(NAVY)
    pdf.rect(0, PAGE_H - 31 * mm, PAGE_W, 31 * mm, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(20 * mm, PAGE_H - 18 * mm, document_title)
    pdf.setFillColor(colors.HexColor("#A8D2D0"))
    pdf.setFont("Helvetica-Bold", 7.5)
    pdf.drawRightString(PAGE_W - 20 * mm, PAGE_H - 18 * mm, "CLARITY REVIEW - SYNTHETIC SOURCE PACK")

    pdf.setFillColor(CORAL_BG)
    pdf.roundRect(20 * mm, PAGE_H - 43 * mm, PAGE_W - 40 * mm, 8.5 * mm, 2 * mm, fill=1, stroke=0)
    pdf.setFillColor(CORAL)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(PAGE_W / 2, PAGE_H - 40.1 * mm, "SYNTHETIC TRAINING DOCUMENT - NOT A REAL CUSTOMER OR SUPPLIER FILE")

    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7.5)
    pdf.drawString(20 * mm, 13 * mm, "Case SG-FC-001 | Generated for UI demonstration only")
    pdf.drawRightString(PAGE_W - 20 * mm, 13 * mm, f"Page {page_number} of 3")
    pdf.setStrokeColor(LINE)
    pdf.line(20 * mm, 17 * mm, PAGE_W - 20 * mm, 17 * mm)
    return PAGE_H - 53 * mm


def label_value(pdf: canvas.Canvas, x: float, y: float, label: str, value: str, width: float = 75 * mm) -> None:
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica-Bold", 7.5)
    pdf.drawString(x, y, label.upper())
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica", 10)
    pdf.drawString(x, y - 5 * mm, value)
    pdf.setStrokeColor(LINE)
    pdf.line(x, y - 8 * mm, x + width, y - 8 * mm)


def section_title(pdf: canvas.Canvas, y: float, kicker: str, title: str) -> float:
    pdf.setFillColor(TEAL)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(20 * mm, y, kicker.upper())
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(20 * mm, y - 7 * mm, title)
    return y - 16 * mm


def callout(pdf: canvas.Canvas, y: float, text: str, background=AMBER_BG) -> float:
    styles = getSampleStyleSheet()
    style = ParagraphStyle(
        "callout",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=NAVY,
        alignment=TA_LEFT,
    )
    paragraph = Paragraph(text, style)
    width = PAGE_W - 40 * mm
    _, height = paragraph.wrap(width - 12 * mm, 30 * mm)
    box_height = height + 9 * mm
    pdf.setFillColor(background)
    pdf.roundRect(20 * mm, y - box_height, width, box_height, 2.5 * mm, fill=1, stroke=0)
    paragraph.drawOn(pdf, 26 * mm, y - height - 4 * mm)
    return y - box_height - 7 * mm


def draw_formula_page(pdf: canvas.Canvas) -> None:
    y = header(pdf, "Client Formula Sheet", 1)
    y = section_title(pdf, y, "Client submission", "Daily Gentle Cleanser")
    label_value(pdf, 20 * mm, y, "Case ID", "SG-FC-001")
    label_value(pdf, 108 * mm, y, "Client alias", "Pilot Brand A")
    label_value(pdf, 20 * mm, y - 19 * mm, "Target market", "Singapore")
    label_value(pdf, 108 * mm, y - 19 * mm, "Product type", "Rinse-off facial cleanser")
    label_value(pdf, 20 * mm, y - 38 * mm, "Document version", "Formula sheet v3")
    label_value(pdf, 108 * mm, y - 38 * mm, "Submission date", "12 Sep 2026")
    y -= 57 * mm

    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(20 * mm, y, "Finished-product formula")
    data = [
        ["Raw material", "Supplier", "Use level", "Declared identity", "Evidence"],
        ["Aqua", "-", "70.0%", "Aqua", "Formula sheet"],
        ["Cocamidopropyl Betaine solution", "Supplier B", "20.0%", "Mapping to confirm", "Specification v2.1"],
        ["Glycerin", "Supplier C", "5.0%", "Glycerin", "Specification"],
        ["Sodium Chloride", "Supplier D", "3.5%", "Sodium Chloride", "Specification"],
        ["Phenoxyethanol", "Supplier E", "0.8%", "Phenoxyethanol", "Specification"],
        ["Xanthan Gum", "Supplier F", "0.5%", "Xanthan Gum", "Specification"],
        ["Fragrance F-17", "Supplier G", "0.2%", "Fragrance", "SDS only"],
        ["TOTAL", "", "100.0%", "", ""],
    ]
    table = Table(data, colWidths=[49 * mm, 28 * mm, 22 * mm, 43 * mm, 30 * mm], rowHeights=[9 * mm] + [10 * mm] * 8)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("TEXTCOLOR", (0, 1), (-1, -1), NAVY),
        ("FONTNAME", (0, 1), (-1, -2), "Helvetica"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, 7), (-1, 7), CORAL_BG),
        ("BACKGROUND", (0, -1), (-1, -1), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    tw, th = table.wrapOn(pdf, PAGE_W - 40 * mm, 100 * mm)
    table.drawOn(pdf, 20 * mm, y - th - 5 * mm)
    y = y - th - 13 * mm
    callout(
        pdf,
        y,
        "Reviewer note: the formula total is 100.0%, but the fragrance row cites an SDS only. "
        "A complete component composition has not been supplied, so component-level screening must remain open.",
    )


def draw_fragrance_page(pdf: canvas.Canvas) -> None:
    y = header(pdf, "Supplier Safety Data Sheet", 2)
    y = section_title(pdf, y, "Supplier G", "Fragrance F-17")
    label_value(pdf, 20 * mm, y, "Document", "Safety Data Sheet")
    label_value(pdf, 108 * mm, y, "Version", "SDS 2.0 - 08 Sep 2026")
    label_value(pdf, 20 * mm, y - 19 * mm, "Product identifier", "Fragrance F-17")
    label_value(pdf, 108 * mm, y - 19 * mm, "Intended use", "Cosmetic fragrance compound")
    y -= 45 * mm

    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(20 * mm, y, "Section 3 - Composition / information on ingredients")
    y -= 10 * mm
    data = [
        ["Component description", "CAS / identifier", "Concentration"],
        ["Fragrance mixture", "Proprietary", "100%"],
        ["Individual fragrance components", "Not disclosed in this SDS", "Not disclosed"],
    ]
    table = Table(data, colWidths=[65 * mm, 58 * mm, 49 * mm], rowHeights=[10 * mm, 13 * mm, 15 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("BACKGROUND", (0, 2), (-1, 2), CORAL_BG),
        ("TEXTCOLOR", (0, 0), (-1, -1), NAVY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ]))
    _, th = table.wrapOn(pdf, PAGE_W - 40 * mm, 60 * mm)
    table.drawOn(pdf, 20 * mm, y - th)
    y = y - th - 14 * mm

    y = callout(
        pdf,
        y,
        "Source limitation: this synthetic SDS identifies the commercial mixture but does not provide its component-level composition. "
        "The prototype must not infer undisclosed ingredients or produce a pass/fail conclusion from this document alone.",
    )
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "Document-purpose note")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 9)
    note = (
        "This page exists only to demonstrate evidence traceability and missing-data handling in UI v1. "
        "It is not authored by a real supplier and must not be used for safety, transport or regulatory decisions."
    )
    max_width = PAGE_W - 40 * mm
    words = note.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if stringWidth(candidate, "Helvetica", 9) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    for line in lines:
        y -= 5 * mm
        pdf.drawString(20 * mm, y, line)


def draw_capb_page(pdf: canvas.Canvas) -> None:
    y = header(pdf, "Supplier Product Specification", 3)
    y = section_title(pdf, y, "Supplier B", "Cocamidopropyl Betaine Solution")
    label_value(pdf, 20 * mm, y, "Specification", "Specification v2.1")
    label_value(pdf, 108 * mm, y, "Issue date", "10 Sep 2026")
    label_value(pdf, 20 * mm, y - 19 * mm, "Trade name", "CAPB Solution B-30")
    label_value(pdf, 108 * mm, y - 19 * mm, "Declared INCI", "Cocamidopropyl Betaine solution")
    y -= 45 * mm

    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(20 * mm, y, "Declared specification")
    y -= 10 * mm
    data = [
        ["Property", "Declared value", "Review status"],
        ["Appearance", "Clear to pale-yellow liquid", "Recorded"],
        ["Active matter", "29.0% - 31.0%", "Recorded"],
        ["pH (10% solution)", "5.0 - 6.0", "Recorded"],
        ["Full component breakdown", "Separate composition statement", "Not supplied"],
        ["Impurity information", "Refer to supplier dossier", "Not supplied"],
    ]
    table = Table(data, colWidths=[58 * mm, 65 * mm, 49 * mm], rowHeights=[10 * mm] + [12 * mm] * 5)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("BACKGROUND", (0, 4), (-1, 5), CORAL_BG),
        ("TEXTCOLOR", (0, 0), (-1, -1), NAVY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ]))
    _, th = table.wrapOn(pdf, PAGE_W - 40 * mm, 90 * mm)
    table.drawOn(pdf, 20 * mm, y - th)
    y = y - th - 14 * mm
    callout(
        pdf,
        y,
        "Reviewer action required: retain the supplier trade name and declared wording until the separate composition statement is obtained. "
        "Do not treat 20.0% raw-material use as 20.0% of a single component in the finished product.",
    )


def build(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    pdf.setTitle("Clarity Review Synthetic Client Source Pack")
    pdf.setAuthor("Clarity Review UI V1")
    pdf.setSubject("Synthetic documents for a cosmetic formula evidence workflow prototype")
    draw_formula_page(pdf)
    pdf.showPage()
    draw_fragrance_page(pdf)
    pdf.showPage()
    draw_capb_page(pdf)
    pdf.showPage()
    pdf.save()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.output)
    print(args.output.resolve())


if __name__ == "__main__":
    main()
