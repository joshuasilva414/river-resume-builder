"""Independent ReportLab reference layouts from the frozen comparison facts."""
import json
import pathlib
import sys
from html import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "test-results/v1.2.1-comparison")
ink = colors.HexColor("#202b36")
body = ParagraphStyle("Body", fontName="Helvetica", fontSize=10.5, leading=13.2, textColor=ink, spaceAfter=3)
name_style = ParagraphStyle("Name", parent=body, fontName="Helvetica-Bold", fontSize=25, leading=29, spaceAfter=7)
heading_style = ParagraphStyle("Heading", parent=body, fontName="Helvetica-Bold", fontSize=11, leading=14, spaceBefore=7, spaceAfter=3, keepWithNext=True)
entry_style = ParagraphStyle("Entry", parent=body, fontName="Helvetica-Bold", keepWithNext=True, spaceAfter=1)
subtitle_style = ParagraphStyle("Subtitle", parent=body, keepWithNext=True, spaceAfter=3)
dates_style = ParagraphStyle("Dates", parent=body, alignment=TA_RIGHT, spaceAfter=0)
bullet_style = ParagraphStyle("Bullet", parent=body, leftIndent=11, firstLineIndent=0, bulletIndent=0, spaceAfter=2)

def text(value):
    if value is None: return ""
    if isinstance(value, dict):
        if value.get("kind") == "year": return str(value["year"])
        if value.get("kind") == "month": return f'{value["month"]:02d}/{value["year"]}'
        if value.get("kind") == "day": return value["value"]
        if value.get("kind") == "present": return "Present"
        if value.get("kind") == "legacy": return value["text"]
        return ""
    return str(value)

def p(value, style=body):
    return Paragraph(escape(text(value)).replace("\n", "<br/>"), style)

def link(value, label=None):
    address = text(value)
    href = address if address.startswith(("https://", "http://", "mailto:")) else f"https://{address}"
    return f'<link href="{escape(href, quote=True)}" color="#202b36">{escape(label or address)}</link>'

def entry(record):
    values = record["values"]
    kind = record["schema"]["id"]
    title_key = {"experience-entry":"employer", "project-entry":"project", "education-entry":"institution", "credential-entry":"credential"}[kind]
    dates = " – ".join(filter(None, [text(values.get("startDate", values.get("issuedDate"))), text(values.get("endDate", values.get("expirationDate")))]))
    header = Table([[p(values.get(title_key), entry_style), p(dates, dates_style)]], colWidths=[351, 177])
    header.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),1)]))
    header.keepWithNext = True
    result = [header]
    secondary = [text(values.get(key)) for key in ["title", "degree", "issuer", "description"] if values.get(key)]
    if values.get("fieldOfStudy"): secondary.append(f'in {text(values["fieldOfStudy"])}')
    if values.get("location"): secondary.append(text(values["location"]))
    if values.get("gpa") is not None: secondary.append(f'GPA {values["gpa"]}')
    if secondary: result.append(p(" · ".join(secondary), subtitle_style))
    if values.get("url"): result.append(Paragraph(link(values["url"]), body))
    for value in values.get("accomplishments", values.get("details", [])):
        result.append(Paragraph(escape(text(value)), bullet_style, bulletText="•"))
    result.append(Spacer(1, 3))
    return result

for source in root.rglob("frozen-content.json"):
    data = json.loads(source.read_text())
    story = []
    for section in data["contents"]:
        values = section["structured"]["record"]["values"]
        if section["type"] == "contact":
            story.append(p(values["name"], name_style))
            lines = [escape(text(values[key])) for key in ["email", "phone", "location"] if values.get(key)]
            lines += [link(item["values"]["url"], item["values"].get("label")) for item in values.get("links", [])]
            story.append(Paragraph(" · ".join(lines), body))
            story.append(Spacer(1, 4))
            continue
        story.append(p(values.get("heading", section["type"]), heading_style))
        rule = HRFlowable(width="100%", thickness=.5, color=colors.HexColor("#82909a"), spaceAfter=5)
        rule.keepWithNext = True
        story.append(rule)
        if values.get("summary"): story.append(p(values["summary"]))
        if values.get("skills"): story.append(p(" · ".join(values["skills"])))
        for record in values.get("entries", []): story.extend(entry(record))
    target = source.with_name("reference.pdf")
    SimpleDocTemplate(str(target), pagesize=(612,792), leftMargin=42, rightMargin=42, topMargin=38, bottomMargin=38, title=f'{data["id"]} independent reference', author="River comparison").build(story)
    print(data["id"], "reference created")
