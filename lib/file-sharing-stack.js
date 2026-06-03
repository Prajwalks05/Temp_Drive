const {
  Stack,
  Duration,
  RemovalPolicy,
  CfnOutput,
  App,
} = require("aws-cdk-lib"); // <-- Ensure App is here
const s3 = require("aws-cdk-lib/aws-s3");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigw = require("aws-cdk-lib/aws-apigateway");
const cognito = require("aws-cdk-lib/aws-cognito");
const iam = require("aws-cdk-lib/aws-iam");
const path = require("path");

class FileSharingStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // 1. S3 Bucket (Private, Block Public Access)
    const fileBucket = new s3.Bucket(this, "SecureFileBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ["*"], // In production, restrict to frontend domain
          allowedHeaders: ["*"],
        },
      ],
    });

    // 2. DynamoDB Table for Metadata
    const fileTable = new dynamodb.Table(this, "FileMetadataTable", {
      partitionKey: { name: "file_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // 3. Cognito User Pool
    const userPool = new cognito.UserPool(this, "FileSharingUsers", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
    });

    const userPoolClient = new cognito.UserPoolClient(this, "AppClient", {
      userPool,
      authFlows: {
        userPassword: true,
      },
    });

    // 4. IAM Role for EventBridge Scheduler to trigger Delete Lambda
    const schedulerRole = new iam.Role(this, "SchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });

    // 5. Lambda Functions
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
      environment: {
        BUCKET_NAME: fileBucket.bucketName,
        TABLE_NAME: fileTable.tableName,
      },
    };

    const deleteLambda = new lambda.Function(this, "DeleteFileHandler", {
      ...commonLambdaProps,
      code: lambda.Code.fromAsset(path.join(__dirname, "../src/delete")),
    });

    const uploadLambda = new lambda.Function(this, "UploadFileHandler", {
      ...commonLambdaProps,
      code: lambda.Code.fromAsset(path.join(__dirname, "../src/upload")),
      environment: {
        ...commonLambdaProps.environment,
        SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
        DELETE_LAMBDA_ARN: deleteLambda.functionArn,
      },
    });

    const downloadLambda = new lambda.Function(this, "DownloadFileHandler", {
      ...commonLambdaProps,
      code: lambda.Code.fromAsset(path.join(__dirname, "../src/download")),
    });

    const shareLambda = new lambda.Function(this, "ShareFileHandler", {
      ...commonLambdaProps,
      code: lambda.Code.fromAsset(path.join(__dirname, "../src/share")),
    });

    // Permissions
    fileBucket.grantReadWrite(uploadLambda);
    fileBucket.grantRead(downloadLambda);
    fileBucket.grantDelete(deleteLambda);

    fileTable.grantReadWriteData(uploadLambda);
    fileTable.grantReadData(downloadLambda);
    fileTable.grantReadWriteData(shareLambda);
    fileTable.grantReadWriteData(deleteLambda);

    // Give EventBridge Scheduler permission to invoke the Delete Lambda
    schedulerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [deleteLambda.functionArn],
      }),
    );

    // Give Upload Lambda permission to create EventBridge Schedules
    uploadLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["scheduler:CreateSchedule", "iam:PassRole"],
        resources: ["*"], // PassRole allows passing the schedulerRole
      }),
    );

    // 6. API Gateway setup with Cognito Authorizer
    const api = new apigw.RestApi(this, "FileSharingApi", {
      restApiName: "Secure File Sharing Service",
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuthorizer",
      {
        cognitoUserPools: [userPool],
      },
    );

    const authOptions = {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    };

    // Endpoints
    api.root
      .addResource("upload")
      .addMethod(
        "POST",
        new apigw.LambdaIntegration(uploadLambda),
        authOptions,
      );
    api.root
      .addResource("share")
      .addMethod("POST", new apigw.LambdaIntegration(shareLambda), authOptions);

    const downloadResource = api.root
      .addResource("download")
      .addResource("{file_id}");
    downloadResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(downloadLambda),
      authOptions,
    );

    // Outputs
    new CfnOutput(this, "ApiUrl", { value: api.url });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "ClientId", { value: userPoolClient.userPoolClientId });
  }
}
const app = new App();

new FileSharingStack(app, "SecureFileSharingStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

module.exports = { FileSharingStack };
