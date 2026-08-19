from pathlib import Path
import fitz

pdf_path = Path("attached_assets/auditoria_hitomi_nexus_1787163622707.pdf")
output_dir = Path(".agents/outputs/hitomi_audit")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(pdf_path)
print(f"pages={document.page_count}")
print(f"metadata={document.metadata}")

for page_number, page in enumerate(document, start=1):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    output_path = output_dir / f"page-{page_number:02d}.png"
    pixmap.save(output_path)
    text = page.get_text("text").strip().replace("\n", " | ")
    print(f"page={page_number} size={page.rect.width:.0f}x{page.rect.height:.0f} text={text[:1000]}")