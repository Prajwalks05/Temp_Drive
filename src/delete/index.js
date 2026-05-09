const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const s3Client = new S3Client({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  // Payload injected by EventBridge Scheduler Target
  const { file_id, s3_key } = event;

  try {
    // 1. Delete from S3
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: s3_key,
      }),
    );

    // 2. Delete Metadata from DynamoDB
    await docClient.send(
      new DeleteCommand({
        TableName: process.env.TABLE_NAME,
        Key: { file_id },
      }),
    );

    console.log(`Successfully deleted file ${file_id}`);
    return { status: "success" };
  } catch (error) {
    console.error(`Failed to delete file ${file_id}:`, error);
    throw error; // Let EventBridge retry if it fails
  }
};
