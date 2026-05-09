const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const s3Client = new S3Client({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  try {
    const fileId = event.pathParameters.file_id;
    const userId = event.requestContext.authorizer.claims.sub;
    const userRole =
      event.requestContext.authorizer.claims["custom:role"] || "user";

    // 1. Fetch metadata
    const { Item: fileMeta } = await docClient.send(
      new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key: { file_id: fileId },
      }),
    );

    if (!fileMeta) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "File not found or expired" }),
      };
    }

    // 2. Validate Expiry Check
    if (new Date() > new Date(fileMeta.expires_at)) {
      return {
        statusCode: 410,
        body: JSON.stringify({ error: "File has expired" }),
      };
    }

    // 3. Validate Access Permissions
    const isOwner = fileMeta.owner_id === userId;
    const isAdmin = userRole === "admin";
    const isShared = fileMeta.shared_with.includes(userId);

    if (!isOwner && !isAdmin && !isShared) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Access denied" }),
      };
    }

    // 4. Generate Pre-signed Download URL
    const command = new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: fileMeta.s3_key,
    });

    // URL expires either in 1 hour or when the file expires, whichever is sooner
    const timeToExpiryMs = new Date(fileMeta.expires_at).getTime() - Date.now();
    const urlExpiry = Math.min(3600, Math.floor(timeToExpiryMs / 1000));

    const downloadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: urlExpiry,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ download_url: downloadUrl }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
