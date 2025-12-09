"""
Cloud Function triggered by Cloud Storage upload
Calls the Cloud Run backend to process the invoice
"""
import os
import json
import requests
from google.cloud import firestore
import functions_framework

# Configuration
CLOUD_RUN_URL = os.environ.get('CLOUD_RUN_URL')
FIRESTORE_COLLECTION = os.environ.get('FIRESTORE_COLLECTION', 'invoices')

# Initialize Firestore
db = firestore.Client()


@functions_framework.cloud_event
def process_invoice_upload(cloud_event):
    """
    Triggered by Cloud Storage when a new file is uploaded

    Args:
        cloud_event: CloudEvent with file metadata
    """
    data = cloud_event.data

    bucket_name = data['bucket']
    file_name = data['name']
    mime_type = data.get('contentType', 'application/octet-stream')

    # Extract image_id from file metadata or generate from filename
    metadata = data.get('metadata', {})
    image_id = metadata.get('image_id') or file_name.replace('/', '_').replace('.', '_')

    print(f"Processing upload: {bucket_name}/{file_name}")
    print(f"Image ID: {image_id}")
    print(f"MIME type: {mime_type}")

    # Create initial Firestore document
    invoice_ref = db.collection(FIRESTORE_COLLECTION).document(image_id)
    invoice_ref.set({
        'status': 'pending',
        'filename': file_name,
        'bucket': bucket_name,
        'mime_type': mime_type,
        'metadata': metadata,
        'created_at': firestore.SERVER_TIMESTAMP
    })

    # Call Cloud Run backend
    try:
        payload = {
            'image_id': image_id,
            'bucket_name': bucket_name,
            'file_name': file_name,
            'mime_type': mime_type,
            'metadata': metadata
        }

        response = requests.post(
            f"{CLOUD_RUN_URL}/process-invoice",
            json=payload,
            timeout=540  # 9 minutes (Cloud Function max timeout)
        )

        if response.status_code == 200:
            print(f"Successfully processed {image_id}")
        else:
            print(f"Error processing {image_id}: {response.status_code} - {response.text}")
            invoice_ref.set({
                'status': 'failed',
                'error': f"Cloud Run returned {response.status_code}: {response.text}",
                'updated_at': firestore.SERVER_TIMESTAMP
            }, merge=True)

    except requests.exceptions.Timeout:
        print(f"Timeout processing {image_id}")
        invoice_ref.set({
            'status': 'failed',
            'error': 'Processing timeout',
            'updated_at': firestore.SERVER_TIMESTAMP
        }, merge=True)

    except Exception as e:
        print(f"Error calling Cloud Run: {e}")
        invoice_ref.set({
            'status': 'failed',
            'error': str(e),
            'updated_at': firestore.SERVER_TIMESTAMP
        }, merge=True)
