"""
Invoice Extractor API - Cloud Run Backend
Opción B: Asynchronous processing with Firestore
"""
import os
from flask import Flask, request, jsonify
from google.cloud import firestore
from datetime import datetime
import logging

# Local imports
from src.processor import InvoiceProcessor
from src.config import Config

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Initialize Firestore
db = firestore.Client(project=Config.GOOGLE_CLOUD_PROJECT)

# Initialize processor
processor = InvoiceProcessor()


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for Cloud Run"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'invoice-extractor'
    }), 200


@app.route('/process-invoice', methods=['POST'])
def process_invoice():
    """
    Main endpoint to process invoice images
    Called by Cloud Function trigger when image is uploaded to bucket

    Expected payload:
    {
        "image_id": "unique-id",
        "bucket_name": "bucket-name",
        "file_name": "path/to/image.jpg",
        "mime_type": "image/jpeg",
        "metadata": {
            "local_id": "local_123",
            "user_id": "user_456"
        }
    }
    """
    try:
        data = request.get_json()

        # Validate request
        if not data:
            return jsonify({'error': 'No JSON payload provided'}), 400

        image_id = data.get('image_id')
        bucket_name = data.get('bucket_name')
        file_name = data.get('file_name')
        mime_type = data.get('mime_type')
        metadata = data.get('metadata', {})

        if not all([image_id, bucket_name, file_name]):
            return jsonify({'error': 'Missing required fields'}), 400

        logger.info(f"Processing invoice: {image_id} - {file_name}")

        # Update Firestore status to 'processing'
        invoice_ref = db.collection(Config.FIRESTORE_COLLECTION).document(image_id)
        invoice_ref.set({
            'status': 'processing',
            'filename': file_name,
            'mime_type': mime_type,
            'metadata': metadata,
            'updated_at': firestore.SERVER_TIMESTAMP,
            'processing_started_at': firestore.SERVER_TIMESTAMP
        }, merge=True)

        # Process the invoice
        result = processor.process_from_bucket(
            bucket_name=bucket_name,
            file_name=file_name,
            mime_type=mime_type
        )

        # Update Firestore with results
        invoice_ref.set({
            'status': 'completed',
            'items': result['items'],
            'metadata': {
                **metadata,
                'items_count': len(result['items']),
                'used_gemini': result['used_gemini'],
                'used_transform': result['used_transform'],
                'processing_time_seconds': result['processing_time']
            },
            'updated_at': firestore.SERVER_TIMESTAMP,
            'completed_at': firestore.SERVER_TIMESTAMP
        }, merge=True)

        logger.info(f"Successfully processed {image_id}: {len(result['items'])} items")

        return jsonify({
            'success': True,
            'image_id': image_id,
            'items_count': len(result['items']),
            'processing_time': result['processing_time']
        }), 200

    except Exception as e:
        logger.error(f"Error processing invoice: {e}", exc_info=True)

        # Update Firestore with error
        if 'image_id' in locals():
            try:
                db.collection(Config.FIRESTORE_COLLECTION).document(image_id).set({
                    'status': 'failed',
                    'error': str(e),
                    'updated_at': firestore.SERVER_TIMESTAMP,
                    'failed_at': firestore.SERVER_TIMESTAMP
                }, merge=True)
            except Exception as db_error:
                logger.error(f"Failed to update Firestore with error: {db_error}")

        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/invoice/<invoice_id>', methods=['GET'])
def get_invoice(invoice_id):
    """
    Get invoice processing status and results
    Used by frontend to check processing status
    """
    try:
        invoice_ref = db.collection(Config.FIRESTORE_COLLECTION).document(invoice_id)
        invoice = invoice_ref.get()

        if not invoice.exists:
            return jsonify({'error': 'Invoice not found'}), 404

        return jsonify(invoice.to_dict()), 200

    except Exception as e:
        logger.error(f"Error fetching invoice: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=Config.ENVIRONMENT == 'development')
