import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import client from 'prom-client';

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET;
const videoServiceUrl = process.env.VIDEO_SERVICE_URL || 'http://video-service:3000';
const mediaBaseUrl = process.env.MEDIA_BASE_URL || 'https://example.cloudfront.net';

client.collectDefaultMetrics();
const httpRequests = new client.Counter({
  name: 'streaming_http_requests_total',
  help: 'Streaming service HTTP requests',
  labelNames: ['method', 'route', 'status']
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  res.on('finish', () => httpRequests.inc({ method: req.method, route: req.path, status: res.statusCode }));
  next();
});

function requireUser(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'streaming-service' }));
app.get('/metrics', async (_, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/:videoId', requireUser, async (req, res) => {
  const response = await fetch(`${videoServiceUrl}/${req.params.videoId}`);
  if (!response.ok) return res.status(404).json({ error: 'video not found' });
  const video = await response.json();
  if (video.status !== 'ready') return res.status(409).json({ error: 'video is not ready' });
  const manifestKey = video.hlsManifestKey || `processed/hls/${req.params.videoId}/master.m3u8`;
  res.json({
    videoId: req.params.videoId,
    playbackUrl: `${mediaBaseUrl}/${manifestKey}`,
    expiresInSeconds: 3600
  });
});

app.listen(port, () => console.log(`streaming-service listening on ${port}`));
