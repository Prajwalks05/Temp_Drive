const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const {
  SchedulerClient,
  CreateScheduleCommand,
} = require("@aws-sdk/client-scheduler");
const crypto = require("crypto");

const s3Client = new S3Client({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const schedulerClient = new SchedulerClient({});

exports.handler = async (event) => {
  try {
    const { filename, contentType, expiryHours } = JSON.parse(event.body);
    const userId = event.requestContext.authorizer.claims.sub;
    const userRole =
      event.requestContext.authorizer.claims["custom:role"] || "user";

    // Validate expiry max 72 hours
    const hours = Math.min(Math.max(1, expiryHours || 24), 72);

    const fileId = crypto.randomUUID();
    const s3Key = `uploads/${userId}/${fileId}-${filename}`;
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000);

    // 1. Generate Pre-signed URL
    const command = new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 }); // 10 min

    // 2. Save metadata to DynamoDB
    const item = {
      file_id: fileId,
      owner_id: userId,
      role_access: userRole,
      s3_key: s3Key,
      filename,
      shared_with: [], // Array of user IDs this is shared with
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: item,
      }),
    );

    // 3. Schedule Deletion with EventBridge Scheduler
    // EventBridge requires a specific time format: yyyy-mm-ddThh:mm:ss
    const scheduleTime = expiresAt.toISOString().replace(/\.\d{3}Z$/, "");

    await schedulerClient.send(
      new CreateScheduleCommand({
        Name: `DeleteFile-${fileId}`,
        ScheduleExpression: `at(${scheduleTime})`,
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: {
          Arn: process.env.DELETE_LAMBDA_ARN,
          RoleArn: process.env.SCHEDULER_ROLE_ARN,
          Input: JSON.stringify({ file_id: fileId, s3_key: s3Key }),
        },
        ActionAfterCompletion: "DELETE", // Auto cleanup schedule
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        file_id: fileId,
        upload_url: uploadUrl,
        expires_at: expiresAt,
      }),
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
