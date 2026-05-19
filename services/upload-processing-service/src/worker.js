import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

const region = process.env.AWS_REGION || 'ap-southeast-1';
const queueUrl = process.env.SQS_QUEUE_URL || '';
const videoServiceUrl = process.env.VIDEO_SERVICE_URL || 'http://video-service:3000';
const sqs = new SQSClient({ region });

async function processMessage(message) {
  const job = JSON.parse(message.Body);
  console.log('processing video job', job);

  await fetch(`${videoServiceUrl}/${job.videoId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'ready',
      hlsManifestKey: `${job.processedPrefix}master.m3u8`,
      thumbnailUrl: job.thumbnailKey
    })
  });

  console.log('video job completed', job.videoId);
}

async function poll() {
  if (!queueUrl) {
    console.log('SQS_QUEUE_URL is not set; worker is idling');
    await new Promise((resolve) => setTimeout(resolve, 30000));
    return;
  }

  const response = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,
    VisibilityTimeout: 300
  }));

  for (const message of response.Messages || []) {
    await processMessage(message);
    await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
  }
}

while (true) {
  try {
    await poll();
  } catch (error) {
    console.error('worker loop failed', error);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

