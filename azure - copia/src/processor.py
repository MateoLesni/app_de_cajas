"""
Main invoice processor that orchestrates Azure, Gemini, and supplier plugins
"""
import time
from typing import List, Dict, Optional, Tuple
from google.cloud import storage
from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.core.credentials import AzureKeyCredential

from src.config import Config
from src.gemini_client import extract_invoice_items
from src.utils import (
    sanitize_azure_items,
    should_full_handoff_default,
    unwrap_azure_num
)
from src.supplier_plugins import resolve_supplier_plugin


class InvoiceProcessor:
    """Main processor for invoice extraction"""

    def __init__(self):
        # Initialize Azure client
        if not Config.SKIP_AZURE:
            self.azure_client = DocumentAnalysisClient(
                Config.AZURE_ENDPOINT,
                AzureKeyCredential(Config.AZURE_KEY)
            )
        else:
            self.azure_client = None

        # Initialize Cloud Storage client
        self.storage_client = storage.Client(project=Config.GOOGLE_CLOUD_PROJECT)

    def process_from_bucket(
        self,
        bucket_name: str,
        file_name: str,
        mime_type: str
    ) -> Dict:
        """
        Process invoice from Cloud Storage bucket

        Args:
            bucket_name: GCS bucket name
            file_name: File path in bucket
            mime_type: MIME type of file

        Returns:
            {
                'items': List of invoice items,
                'used_gemini': bool,
                'used_transform': bool,
                'processing_time': float (seconds)
            }
        """
        start_time = time.time()

        # Download file from bucket
        bucket = self.storage_client.bucket(bucket_name)
        blob = bucket.blob(file_name)
        content = blob.download_as_bytes()

        # Process the invoice
        result = self.process_invoice(content, mime_type, file_name)

        # Add processing time
        result['processing_time'] = round(time.time() - start_time, 2)

        return result

    def process_invoice(
        self,
        content: bytes,
        mime_type: str,
        filename: str
    ) -> Dict:
        """
        Process invoice content

        Args:
            content: File bytes
            mime_type: MIME type
            filename: Original filename

        Returns:
            {
                'items': List of invoice items,
                'used_gemini': bool,
                'used_transform': bool
            }
        """
        items_azure: List[Dict] = []
        items_final: List[Dict] = []
        used_gemini = False
        used_transform = False
        azure_error: Optional[str] = None

        # 1) Try Azure first
        if Config.SKIP_AZURE:
            azure_error = "Azure disabled (SKIP_AZURE=1)"
            print(f"  ⚠ {azure_error}")
        else:
            try:
                items_azure = self._analyze_with_azure(content)
                items_azure = sanitize_azure_items(items_azure)
                print(f"  ▶ Azure extracted {len(items_azure)} items")
            except Exception as e:
                azure_error = f"{type(e).__name__}: {e}"
                print(f"  ✖ Azure failed: {azure_error}")

        # 2) Get supplier plugin
        extra_prompt, plugin_src, transform_azure_fn, transform_items_fn, should_fn = \
            resolve_supplier_plugin(filename)

        if plugin_src:
            print(f"  ➕ Supplier plugin detected: {plugin_src}")

        # 3) Apply Azure transform if available
        if items_azure and transform_azure_fn:
            try:
                items_azure_tx = transform_azure_fn(items_azure)
                if isinstance(items_azure_tx, list):
                    items_azure = items_azure_tx
                    print(f"  🔧 Azure transform applied")
            except Exception as e:
                print(f"  ✖ Azure transform error: {e}")

        # 4) Decide if full handoff to Gemini
        do_full = False
        reasons: List[str] = []

        if azure_error:
            do_full = True
            reasons.append("Azure failed/disabled → forcing Gemini FULL")
        elif not items_azure:
            do_full = True
            reasons.append("Azure returned no items → Gemini FULL")
        else:
            try:
                if should_fn:
                    do_full, reasons = should_fn(items_azure)
                else:
                    do_full, reasons = should_full_handoff_default(items_azure)
            except Exception as e:
                print(f"  ✖ should_full_handoff failed: {e}")
                do_full, reasons = False, []

        for r in reasons:
            print(f"  ⚠ FULL trigger: {r}")

        # 5) Execute Gemini if needed
        if do_full:
            try:
                items_final = extract_invoice_items(content, mime_type, extra_prompt)
                used_gemini = True
                print(f"  ▶ Gemini FULL extracted {len(items_final)} items")

                # Apply post-Gemini transform if available
                if transform_items_fn:
                    try:
                        items_tx = transform_items_fn(items_final)
                        if isinstance(items_tx, list):
                            items_final = items_tx
                            used_transform = True
                            print(f"  🔧 Post-Gemini transform applied")
                    except Exception as e:
                        print(f"  ✖ Transform error: {e}")
            except Exception as e:
                print(f"  ✖ Gemini Full error: {e}")
                items_final = items_azure
        else:
            items_final = items_azure
            print(f"  ✓ Using Azure items (no FULL needed)")

        return {
            'items': items_final,
            'used_gemini': used_gemini,
            'used_transform': used_transform
        }

    def _analyze_with_azure(self, content: bytes) -> List[Dict]:
        """Analyze invoice with Azure Form Recognizer"""
        if not self.azure_client:
            raise RuntimeError("Azure client not initialized")

        poller = self.azure_client.begin_analyze_document(
            model_id="prebuilt-invoice",
            document=content
        )
        result = poller.result()

        items_out: List[Dict] = []
        for doc in result.documents:
            items_field = doc.fields.get("Items")
            if not items_field or not items_field.value:
                continue

            for it in items_field.value:
                flds = it.value

                def v(name: str):
                    f = flds.get(name)
                    return getattr(f, "value", None) if f else None

                qty = unwrap_azure_num(v("Quantity"))
                unit_price = unwrap_azure_num(v("UnitPrice"))
                amount = unwrap_azure_num(v("Amount"))

                subtotal = amount if amount is not None else (
                    round(qty * unit_price, 2) if (qty is not None and unit_price is not None) else None
                )

                items_out.append({
                    "Codigo": v("ProductCode"),
                    "Descripcion": v("Description"),
                    "Cantidad": qty,
                    "PrecioUnitario": unit_price,
                    "Subtotal": subtotal,
                })

        return items_out
