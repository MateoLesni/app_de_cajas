"""
Configuration management using environment variables
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Application configuration"""

    # Azure Form Recognizer
    AZURE_ENDPOINT = os.getenv('AZURE_ENDPOINT')
    AZURE_KEY = os.getenv('AZURE_KEY')

    # Google Cloud
    GOOGLE_CLOUD_PROJECT = os.getenv('GOOGLE_CLOUD_PROJECT')
    GOOGLE_APPLICATION_CREDENTIALS = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')

    # Gemini API
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

    # Firestore
    FIRESTORE_COLLECTION = os.getenv('FIRESTORE_COLLECTION', 'invoices')

    # Cloud Storage
    BUCKET_NAME = os.getenv('BUCKET_NAME')

    # Environment
    ENVIRONMENT = os.getenv('ENVIRONMENT', 'development')
    PORT = int(os.getenv('PORT', 8080))

    # Skip Azure for testing
    SKIP_AZURE = os.getenv('SKIP_AZURE', '0').lower() in ('1', 'true', 't', 'yes', 'y')

    @classmethod
    def validate(cls):
        """Validate that all required config is present"""
        required = [
            'AZURE_ENDPOINT',
            'AZURE_KEY',
            'GOOGLE_CLOUD_PROJECT',
            'GEMINI_API_KEY',
            'BUCKET_NAME'
        ]

        missing = [key for key in required if not getattr(cls, key)]

        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
