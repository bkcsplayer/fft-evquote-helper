"""Invoice PDF rendering — HTML/Jinja template rendered to PDF bytes via WeasyPrint.

Pure renderer: callers assemble the full context dict (line items, totals, brand info already
resolved); this module only turns that into bytes. Kept separate from notification_service.py so
the WeasyPrint dependency stays isolated to one file.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"
_env = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)), autoescape=select_autoescape(["html"]))


def render_invoice_pdf(context: dict[str, Any]) -> bytes:
    template = _env.get_template("invoice_pdf.html")
    html = template.render(**context)
    return HTML(string=html).write_pdf()
