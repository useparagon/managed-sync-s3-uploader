# Managed Sync S3 Uploader

A Node.js service that extracts binary content from Paragon Managed Sync and automatically uploads it to Amazon S3.

This service handles the complete sync lifecycle including initial syncs, incremental updates, and webhook events.

## Prerequisites

- Node.js 20+ (for local development)
- Docker (for containerized deployment)
- AWS account with S3 bucket and credentials
- Paragon account with Managed Sync enabled

## Quick Start

1. **Install dependencies:**

   ```bash
   cd paragon-sync-extractor/
   npm install
   ```

2. **Create `.env` file:**

   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables** in `.env`:

   From AWS:

   ```env
   AWS_ACCESS_KEY_ID=your_aws_access_key_id
   AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
   AWS_S3_BUCKET_NAME=your_s3_bucket_name
   AWS_REGION=us-east-1
   ```

   From Paragon:

   ```env
   PARAGON_PROJECT_ID="your_paragon_project_id"
   PARAGON_SIGNING_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

4. **Start the service:**

   ```bash
   npm run dev
   ```

5. **Enable a sync:**

   Call the [Enable Sync](https://docs.useparagon.com/managed-sync/api/enable-a-sync) endpoint, changing the base URL from `https://sync.useparagon.com` to the hostname of the running uploader service (e.g. http://localhost:3000).

   This uploader service, when deployed, becomes the new base URL that is used when calling Managed Sync endpoints.

   ```bash
   curl --request POST \
     --url http://localhost:3000/api/syncs \
     --header 'Authorization: Bearer <Paragon User Token>' \
     --header 'Content-Type: application/json' \
     --data '{
     "integration": "googledrive",
     "pipeline": "files",
     "configuration": {},
     "configurationName": "<string>"
   }'
   ```

## API Endpoints

All API endpoints (except `/health` and `/api/webhooks`) require authentication via the `Authorization` header with a Paragon User Token.
The API is identical to the Managed Sync API documented [here](https://docs.useparagon.com/managed-sync/sync-api), forwarding all requests directly if not handled by this uploader service.

This service overrides the Enable Sync endpoint to track created syncs in an S3-persisted state file.

### Authentication

Include the Paragon User Token in the `Authorization` header:

```
Authorization: Bearer <your_paragon_user_token>
```

The token will be validated with your signing key before processing any request.
