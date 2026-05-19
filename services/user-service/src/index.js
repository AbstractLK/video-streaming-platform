import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import client from 'prom-client';

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || 'dev-only-secret';
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

client.collectDefaultMetrics();
const httpRequests = new client.Counter({
  name: 'user_http_requests_total',
  help: 'User service HTTP requests',
  labelNames: ['method', 'route', 'status']
});

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.on('finish', () => httpRequests.inc({ method: req.method, route: req.path, status: res.statusCode }));
  next();
});

function requireUser(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    create table if not exists user_profiles (user_id text primary key, display_name text, created_at timestamptz default now());
    create table if not exists favorites (user_id text, video_id text, created_at timestamptz default now(), primary key (user_id, video_id));
    create table if not exists watch_history (user_id text, video_id text, progress_seconds int default 0, updated_at timestamptz default now(), primary key (user_id, video_id));
  `);
}

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'user-service' }));
app.get('/metrics', async (_, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/profile', requireUser, async (req, res) => {
  if (!pool) return res.json({ userId: req.user.sub, displayName: 'Demo User' });
  const result = await pool.query('select user_id as "userId", display_name as "displayName" from user_profiles where user_id = $1', [req.user.sub]);
  res.json(result.rows[0] || { userId: req.user.sub, displayName: req.user.email });
});

app.put('/profile', requireUser, async (req, res) => {
  const { displayName } = req.body;
  if (!pool) return res.json({ userId: req.user.sub, displayName });
  const result = await pool.query(
    `insert into user_profiles (user_id, display_name) values ($1, $2)
     on conflict (user_id) do update set display_name = excluded.display_name
     returning user_id as "userId", display_name as "displayName"`,
    [req.user.sub, displayName]
  );
  res.json(result.rows[0]);
});

app.get('/favorites', requireUser, async (req, res) => {
  if (!pool) return res.json([]);
  const result = await pool.query('select video_id as "videoId" from favorites where user_id = $1', [req.user.sub]);
  res.json(result.rows);
});

app.post('/favorites/:videoId', requireUser, async (req, res) => {
  if (pool) await pool.query('insert into favorites (user_id, video_id) values ($1, $2) on conflict do nothing', [req.user.sub, req.params.videoId]);
  res.status(201).json({ videoId: req.params.videoId });
});

app.delete('/favorites/:videoId', requireUser, async (req, res) => {
  if (pool) await pool.query('delete from favorites where user_id = $1 and video_id = $2', [req.user.sub, req.params.videoId]);
  res.status(204).end();
});

app.post('/watch-history', requireUser, async (req, res) => {
  const { videoId, progressSeconds = 0 } = req.body;
  if (pool) {
    await pool.query(
      `insert into watch_history (user_id, video_id, progress_seconds) values ($1, $2, $3)
       on conflict (user_id, video_id) do update set progress_seconds = excluded.progress_seconds, updated_at = now()`,
      [req.user.sub, videoId, progressSeconds]
    );
  }
  res.status(201).json({ videoId, progressSeconds });
});

ensureSchema()
  .then(() => app.listen(port, () => console.log(`user-service listening on ${port}`)))
  .catch((error) => {
    console.error('user-service failed to start', error);
    process.exit(1);
  });

