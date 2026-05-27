import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { randomUUID } from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import client from 'prom-client';

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;

const region = process.env.AWS_REGION || 'ap-southeast-1';
const mediaBucket = process.env.MEDIA_BUCKET || 'video-streaming-dev-media-860977520998';
const s3 = new S3Client({ region });

client.collectDefaultMetrics();
const httpRequests = new client.Counter({
  name: 'video_http_requests_total',
  help: 'Video service HTTP requests',
  labelNames: ['method', 'route', 'status']
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  res.on('finish', () => httpRequests.inc({ method: req.method, route: req.path, status: res.statusCode }));
  next();
});

function requireAdmin(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const user = jwt.verify(token, jwtSecret);
    if (user.role !== 'admin') return res.status(403).json({ error: 'admin access required' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    create table if not exists videos (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      description text default '',
      genre text default 'General',
      thumbnail_url text,
      raw_s3_key text,
      hls_manifest_key text,
      status text default 'uploaded',
      created_at timestamptz default now()
    )
  `);
}

async function listVideos() {
  if (!pool) return [];
  const result = await pool.query(`
    select id, title, description, genre, thumbnail_url as "thumbnailUrl",
      hls_manifest_key as "hlsManifestKey", status
    from videos
    order by created_at desc
  `);
  return result.rows;
}

async function deleteS3Prefix(prefix) {
  try {
    const listResponse = await s3.send(new ListObjectsV2Command({
      Bucket: mediaBucket,
      Prefix: prefix
    }));
    const objects = listResponse.Contents;
    if (!objects || objects.length === 0) return;
    await s3.send(new DeleteObjectsCommand({
      Bucket: mediaBucket,
      Delete: { Objects: objects.map((obj) => ({ Key: obj.Key })) }
    }));
    console.log(`Deleted ${objects.length} S3 objects under ${prefix}`);
  } catch (error) {
    console.error(`Failed to delete S3 objects under ${prefix}:`, error.message);
  }
}

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'video-service' }));
app.get('/metrics', async (_, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/', async (req, res) => {
  const { genre, q } = req.query;
  let videos = await listVideos();
  if (genre) videos = videos.filter((video) => video.genre?.toLowerCase() === String(genre).toLowerCase());
  if (q) videos = videos.filter((video) => video.title.toLowerCase().includes(String(q).toLowerCase()));
  res.json(videos);
});

app.get('/search', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const videos = await listVideos();
  res.json(videos.filter((video) => video.title.toLowerCase().includes(q)));
});

app.get('/:id', async (req, res) => {
  const videos = await listVideos();
  const video = videos.find((item) => String(item.id) === req.params.id);
  if (!video) return res.status(404).json({ error: 'video not found' });
  res.json(video);
});

app.post('/', requireAdmin, async (req, res) => {
  const { title, description = '', genre = 'General', thumbnailUrl, rawS3Key } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  if (!pool) return res.status(201).json({ id: randomUUID(), title, description, genre, thumbnailUrl, rawS3Key, status: 'uploaded' });
  const result = await pool.query(
    `insert into videos (title, description, genre, thumbnail_url, raw_s3_key)
     values ($1, $2, $3, $4, $5)
     returning id, title, description, genre, thumbnail_url as "thumbnailUrl", raw_s3_key as "rawS3Key", status`,
    [title, description, genre, thumbnailUrl, rawS3Key]
  );
  res.status(201).json(result.rows[0]);
});

app.delete('/:id', requireAdmin, async (req, res) => {
  const videoId = req.params.id;

  if (!pool) return res.status(204).end();

  // Get the video to find S3 keys before deleting
  const result = await pool.query('select id, raw_s3_key as "rawS3Key" from videos where id = $1', [videoId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'video not found' });

  // Delete S3 objects: raw video, processed HLS, and thumbnails
  await Promise.all([
    deleteS3Prefix(`raw/videos/${videoId}/`),
    deleteS3Prefix(`processed/hls/${videoId}/`),
    deleteS3Prefix(`thumbnails/${videoId}/`)
  ]);

  // Delete the database row
  await pool.query('delete from videos where id = $1', [videoId]);

  res.status(204).end();
});

app.patch('/:id/status', async (req, res) => {
  const { status, hlsManifestKey, thumbnailUrl } = req.body;
  if (!pool) return res.json({ id: req.params.id, status, hlsManifestKey, thumbnailUrl });
  const result = await pool.query(
    `update videos set status = $1, hls_manifest_key = coalesce($2, hls_manifest_key), thumbnail_url = coalesce($3, thumbnail_url)
     where id = $4 returning id, status, hls_manifest_key as "hlsManifestKey", thumbnail_url as "thumbnailUrl"`,
    [status, hlsManifestKey, thumbnailUrl, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'video not found' });
  res.json(result.rows[0]);
});

ensureSchema()
  .then(() => app.listen(port, () => console.log(`video-service listening on ${port}`)))
  .catch((error) => {
    console.error('video-service failed to start', error);
    process.exit(1);
  });
