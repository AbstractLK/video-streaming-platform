import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import cors from 'cors';
import express from 'express';
import client from 'prom-client';

const app = express();
const port = process.env.PORT || 3000;
const region = process.env.AWS_REGION || 'ap-southeast-1';
const mediaBucket = process.env.MEDIA_BUCKET || 'video-streaming-media-dev';
const queueUrl = process.env.SQS_QUEUE_URL || '';
const s3 = new S3Client({ region });
const sqs = new SQSClient({ region });

client.collectDefaultMetrics();
const httpRequests = new client.Counter({
  name: 'upload_http_requests_total',
  help: 'Upload service HTTP requests',
  labelNames: ['method', 'route', 'status']
});

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.on('finish', () => httpRequests.inc({ method: req.method, route: req.path, status: res.statusCode }));
  next();
});

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'upload-processing-service' }));
app.get('/metrics', async (_, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.post('/presigned-url', async (req, res) => {
  const videoId = req.body.videoId || crypto.randomUUID();
  const key = `raw/videos/${videoId}/original.mp4`;
  const command = new PutObjectCommand({ Bucket: mediaBucket, Key: key, ContentType: 'video/mp4' });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  res.json({ videoId, uploadUrl, rawS3Key: key });
});

app.post('/complete', async (req, res) => {
  const { videoId, rawS3Key } = req.body;
  if (!videoId || !rawS3Key) return res.status(400).json({ error: 'videoId and rawS3Key are required' });
  const message = {
    videoId,
    rawS3Key,
    processedPrefix: `processed/hls/${videoId}/`,
    thumbnailKey: `thumbnails/${videoId}/thumbnail.jpg`
  };
  if (queueUrl) {
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(message) }));
  }
  res.status(202).json({ queued: Boolean(queueUrl), message });
});

app.listen(port, () => console.log(`upload-processing-service listening on ${port}`));

