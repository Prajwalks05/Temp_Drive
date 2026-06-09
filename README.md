# Secure Serverless File Sharing Platform

A highly scalable, 100% serverless file-sharing architecture deployed via AWS CDK. This system is designed to handle time-bound, authorized file access with zero residual data and zero idle compute costs.

Rather than routing heavy file streams through a traditional backend, this architecture utilizes Amazon S3 Pre-Signed URLs for direct, strictly authenticated data transfers.

## 🏗️ Architecture Overview

The backend leverages an event-driven microservices pattern to optimize data flow and guarantee automated self-destruction of both physical files and their access metadata.

- **API Edge & Auth:** Amazon API Gateway + Amazon Cognito
- **Compute:** AWS Lambda (Node.js)
- **Storage (Files):** Amazon S3
- **Storage (Metadata):** Amazon DynamoDB
- **Auto-Expiry Engine:** Amazon EventBridge Scheduler
- **Infrastructure as Code:** AWS CDK v2

### System Flow

1. **Upload Request:** Authenticated user requests an upload. The API creates a DynamoDB record, sets an EventBridge deletion schedule, and returns an S3 Pre-Signed URL.
2. **Direct Transfer:** The client streams the file directly to S3, completely bypassing the Lambda/API Gateway compute layer.
3. **Access Control:** The owner can grant explicit download permissions to other registered Cognito users via the `/share` endpoint.
4. **Automated Cleanup:** At the exact moment of expiry, EventBridge triggers a dedicated Lambda to surgically delete the physical file from S3 and wipe the DynamoDB access record.

## ✨ Key Features

- **Direct-to-Cloud Uploads:** Bypasses backend bottlenecks, allowing massive file uploads without hitting API Gateway payload limits or Lambda timeout restrictions.
- **Zero-Compute Auto-Expiry:** Eliminates the need for continuous database scanning (cron jobs). Expiry is handled purely via scheduled events.
- **Strict Access Control:** Download links are mathematically signed on the fly and bound to the requesting user's identity.

## 🚀 Deployment Instructions

### Prerequisites

- [Node.js](https://nodejs.org/en/download/) installed
- [AWS CLI](https://aws.amazon.com/cli/) installed and configured (`aws configure`)
- [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) installed globally (`npm install -g aws-cdk`)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Prajwalks05/Temp_Drive.git
   cd Temp_Drive
   ```
