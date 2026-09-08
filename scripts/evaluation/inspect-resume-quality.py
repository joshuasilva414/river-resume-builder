"""Render every comparison page and retain a bounded geometry/font audit."""
import json
from pathlib import Path
import subprocess
import sys
from PIL import Image, ImageDraw
import pdfplumber

root = Path(sys.argv[1] if len(sys.argv) > 1 else "test-results/v1.2.1-comparison")
results = []
for source in sorted(root.rglob("frozen-content.json")):
    folder = source.parent
    output = folder / "page-comparisons"
    output.mkdir(exist_ok=True)
    for pdf in sorted(folder.glob("*.pdf")):
        with pdfplumber.open(pdf) as document:
            pages = []
            for page in document.pages:
                chars = [char for char in page.chars if char["text"].strip()]
                if not chars:
                    raise ValueError(f"Blank page in {pdf.name}")
                outside = sum(char["x0"] < 20 or char["x1"] > page.width - 20 or char["top"] < 20 or char["bottom"] > page.height - 20 for char in chars)
                # TeX's point is 1/72.27 inch; PDF user-space units are 1/72 inch.
                minimum_tex_pt = min(char["size"] for char in chars) * 72.27 / 72
                pages.append({"page": page.page_number, "minimumTexPt": round(minimum_tex_pt, 3), "outOfBoundsGlyphs": outside, "links": len(page.hyperlinks)})
                if outside or minimum_tex_pt < 9.99:
                    raise ValueError(f"Geometry/font failure in {pdf.name}, page {page.page_number}")
        subprocess.run(["pdftoppm", "-r", "100", "-png", str(pdf), str(output / pdf.stem)], check=True, capture_output=True)
        results.append({"dataset": str(folder.relative_to(root)), "file": pdf.name, "pages": pages})
        if pdf.stem == "reference":
            continue
    for rendered in sorted(output.glob("*.png")):
        if rendered.name.startswith(("reference-", "pair-")):
            continue
        page_number = rendered.stem.rsplit("-", 1)[-1]
        reference = output / f"reference-{page_number}.png"
        if not reference.exists():
            raise ValueError(f"No reference page for {rendered.name}")
        left = Image.open(reference).convert("RGB")
        right = Image.open(rendered).convert("RGB")
        pair = Image.new("RGB", (left.width + right.width + 24, max(left.height, right.height) + 35), "#e6e8eb")
        pair.paste(left, (0, 35))
        pair.paste(right, (left.width + 24, 35))
        draw = ImageDraw.Draw(pair)
        draw.text((12, 10), "Independent reference", fill="#111111")
        draw.text((left.width + 36, 10), f"River {rendered.stem}", fill="#111111")
        pair.save(output / f"pair-{rendered.name}")
    print(source.parent.name, "all pages rendered and audited")
(root / "page-audit.json").write_text(json.dumps(results, indent=2))
