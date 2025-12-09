# Credentials Directory

This directory should contain your Google Cloud Service Account credentials.

## Setup Instructions

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to IAM & Admin > Service Accounts
3. Create a new service account with these permissions:
   - Cloud Storage Admin (to read/write images)
   - Cloud Datastore User (to write to Firestore)
4. Download the JSON key file
5. Save it as `service-account.json` in this directory
6. **NEVER commit this file to git** (it's already in .gitignore)

## File Structure

```
credentials/
├── README.md (this file)
└── service-account.json (your actual credentials - DO NOT COMMIT)
```

## Security Notes

- The `.gitignore` file excludes all `*.json` files in this directory
- Keep your credentials secure and never share them
- Rotate keys regularly for security
