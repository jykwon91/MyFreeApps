"""Facade module — re-exports demo PDF generators from their respective sub-modules."""

from app.services.demo.demo_generators.document_pdfs import DemoDocumentPdfGenerator
from app.services.demo.demo_generators.tax_forms import DemoTaxPdfGenerator

__all__ = ["DemoDocumentPdfGenerator", "DemoTaxPdfGenerator"]
