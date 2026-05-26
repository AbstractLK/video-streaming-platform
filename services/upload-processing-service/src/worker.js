import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { execFile } from 'child_process';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readdir, rm } from 'fs/promises';
import { dirname, join } from 'path';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';

const region = process.env.AWS_REGION || 'ap-southeast-1';
const queueUrl = process.env.SQS_QUEUE_URL || '';
const mediaBucket = process.env.MEDIA_BUCKET || 'video-streaming-dev-media-860977520998';
const mediaBaseUrl = process.env.MEDIA_BASE_URL || 'https://example.cloudfront.net';
const videoServiceUrl = process.env.VIDEO_SERVICE_URL || 'http://video-service:3000';
const s3 = new S3Client({ region });
const sqs = new SQSClient({ region });
const run = promisify(execFile);

function contentTypeFor(fileName) {
  if (fileName.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (fileName.endsWith('.ts')) return 'video/mp2t';
  if (fileName.endsWith('.jpg')) return 'image/jpeg';
  return 'application/octet-stream';
}

async function patchVideo(videoId, body) {
  const response = await fetch(`${videoServiceUrl}/${videoId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`failed to patch video ${videoId}: ${response.status} ${text}`);
  }
}

async function downloadObject(key, destination) {
  await mkdir(dirname(destination), { recursive: true });
  const response = await s3.send(new GetObjectCommand({ Bucket: mediaBucket, Key: key }));
  await pipeline(response.Body, createWriteStream(destination));
}

async function uploadFile(source, key) {
  await s3.send(new PutObjectCommand({
    Bucket: mediaBucket,
    Key: key,
    Body: createReadStream(source),
    ContentType: contentTypeFor(key)
  }));
}

async function uploadDirectory(sourceDir, keyPrefix) {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(sourceDir, entry.name);
    if (entry.isDirectory()) {
      await uploadDirectory(source, `${keyPrefix}${entry.name}/`);
    } else {
      await uploadFile(source, `${keyPrefix}${entry.name}`);
    }
  }
}

async function processMessage(message) {
  const job = JSON.parse(message.Body);
  console.log('processing video job', job);

  const workDir = `/tmp/video-${job.videoId}`;
  const inputPath = join(workDir, 'original.mp4');
  const outputDir = join(workDir, 'hls');
  const thumbnailPath = join(workDir, 'thumbnail.jpg');

  await rm(workDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  try {
    await patchVideo(job.videoId, { status: 'processing' });
    await downloadObject(job.rawS3Key, inputPath);

    await run('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-f', 'hls',
      '-hls_time', '6',
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', join(outputDir, 'segment-%03d.ts'),
      join(outputDir, 'master.m3u8')
    ]);

    await run('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-frames:v', '1',
      '-q:v', '2',
      thumbnailPath
    ]);

    await uploadDirectory(outputDir, job.processedPrefix);
    await uploadFile(thumbnailPath, job.thumbnailKey);

    await patchVideo(job.videoId, {
      status: 'ready',
      hlsManifestKey: `${job.processedPrefix}master.m3u8`,
      thumbnailUrl: `${mediaBaseUrl}/${job.thumbnailKey}`
    });
  } catch (error) {
    await patchVideo(job.videoId, { status: 'failed' }).catch((patchError) => {
      console.error('failed to mark video failed', patchError);
    });
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

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
