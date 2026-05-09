const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  try {
    const { file_id, target_user_id } = JSON.parse(event.body);
    const userId = event.requestContext.authorizer.claims.sub;

    // We only allow the owner to share the file. Using a condition expression.
    await docClient.send(
      new UpdateCommand({
        TableName: process.env.TABLE_NAME,
        Key: { file_id },
        UpdateExpression:
          "SET shared_with = list_append(if_not_exists(shared_with, :empty_list), :new_user)",
        ConditionExpression: "owner_id = :owner",
        ExpressionAttributeValues: {
          ":new_user": [target_user_id],
          ":empty_list": [],
          ":owner": userId,
        },
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "File shared successfully" }),
    };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Unauthorized or file not found" }),
      };
    }
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
