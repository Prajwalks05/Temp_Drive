# Secure Serverless File Sharing Platform

A highly scalable, **100% serverless file-sharing architecture** deployed using **AWS CDK**. This system is designed to provide **time-bound, authorized file access** with **zero residual data** and **zero idle compute costs**.

Instead of routing large file transfers through a traditional backend, the platform uses **Amazon S3 Pre-Signed URLs** to enable direct, authenticated uploads and downloads.

---

## 🏗️ Architecture Overview

The backend follows an **event-driven microservices architecture** that optimizes data flow and guarantees automated deletion of both stored files and access metadata after expiration.

### Core Services

| Component                 | Service                             |
| ------------------------- | ----------------------------------- |
| API Edge & Authentication | Amazon API Gateway + Amazon Cognito |
| Compute                   | AWS Lambda (Node.js)                |
| File Storage              | Amazon S3                           |
| Metadata Storage          | Amazon DynamoDB                     |
| Auto-Expiry Engine        | Amazon EventBridge Scheduler        |
| Infrastructure as Code    | AWS CDK v2                          |

---

## 🔄 System Flow

### 1. Upload Request

An authenticated user requests an upload URL.

The API:

- Creates a file metadata record in DynamoDB
- Schedules an expiration event using EventBridge Scheduler
- Returns a Pre-Signed S3 upload URL

### 2. Direct File Transfer

The client uploads the file directly to Amazon S3 using the provided Pre-Signed URL.

This completely bypasses:

- API Gateway payload limits
- Lambda execution time constraints
- Backend bandwidth bottlenecks

### 3. Access Control

The file owner can grant download permissions to specific registered Cognito users through the `/share` endpoint.

### 4. Automated Cleanup

When the file reaches its expiration time:

- EventBridge Scheduler triggers a cleanup Lambda
- The file is deleted from S3
- Associated metadata is removed from DynamoDB

---

## ✨ Key Features

### 🚀 Direct-to-Cloud Uploads

Large files are uploaded directly to Amazon S3 without passing through backend services.

**Benefits:**

- No API Gateway payload restrictions
- No Lambda timeout concerns
- Improved scalability and performance

### ⏳ Zero-Compute Auto-Expiry

File expiration is managed using EventBridge Scheduler.

**Benefits:**

- No cron jobs
- No database scans
- Zero idle compute costs

### 🔒 Strict Access Control

Download links are generated dynamically and cryptographically signed.

Access is restricted to:

- File owners
- Explicitly authorized Cognito users

---

## 🚀 Deployment Instructions

### Prerequisites

Install the following tools:

- Node.js
- AWS CLI
- AWS CDK

#### Configure AWS CLI

```bash
aws configure
```

#### Install AWS CDK Globally

```bash
npm install -g aws-cdk
```

---

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Prajwalks05/Temp_Drive
cd Temp_Drive
```

### 2. Install Dependencies

```bash
npm install --ignore-scripts
```

### 3. Bootstrap AWS CDK (First-Time Setup)

If this is your first CDK deployment in the target AWS account and region:

```bash
npx cdk bootstrap
```

### 4. Deploy the Stack

```bash
npx cdk deploy
```

### Deployment Output

After a successful deployment, CDK will output values similar to:

```text
ApiUrl = https://xxxxxxxx.execute-api.region.amazonaws.com
UserPoolId = region_xxxxxxxx
ClientId = xxxxxxxxxxxxxxxxxxxxxxxxxx
```

These values are required for authenticating users and interacting with the API.

---

# 🔌 API Documentation

All endpoints are protected using a **Cognito Authorizer**, except for the direct S3 upload operation.

Include a valid Cognito **ID Token** in the request header:

```http
Authorization: Bearer <IdToken>
```

---

## 1. Request Upload URL

### Endpoint

```http
POST /upload
```

### Request Body

```json
{
  "filename": "confidential_report.pdf",
  "contentType": "application/pdf",
  "expiryHours": 24
}
```

### Response

```json
{
  "file_id": "uuid",
  "upload_url": "https://..."
}
```

---

## 2. Direct S3 Upload

### Endpoint

```http
PUT <upload_url>
```

### Headers

```http
Content-Type: application/pdf
```

> The content type must match the value supplied when requesting the upload URL.

### Authorization

No authorization header is required.

### Request Body

Raw binary file data.

---

## 3. Share File

### Endpoint

```http
POST /share
```

### Request Body

```json
{
  "file_id": "<file_id>",
  "target_user_id": "<cognito_user_sub>"
}
```

### Purpose

Grants download access to another registered Cognito user.

---

## 4. Download File

### Endpoint

```http
GET /download/{file_id}
```

### Response

```json
{
  "download_url": "https://..."
}
```

The generated download URL:

- Is cryptographically signed
- Expires after 15 minutes
- Is returned only if the requester is:
  - The file owner
  - An authorized shared user

---

# 🧹 Teardown

To destroy all deployed infrastructure and avoid future AWS charges:

```bash
npx cdk destroy
```

---

## 📈 Scalability & Cost Benefits

- Fully serverless architecture
- No always-on servers
- Pay-per-use execution model
- Direct S3 data transfers
- Automatic resource cleanup
- Zero idle compute cost

---

## 🔐 Security Highlights

- Amazon Cognito authentication
- API Gateway Cognito Authorizer
- Time-limited S3 Pre-Signed URLs
- Owner-based file authorization
- Explicit user-to-user sharing controls
- Automatic secure file deletion
- Metadata destruction upon expiration

---
