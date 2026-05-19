import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import client from 'prom-client';

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || 'dev-only-secret';
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;

client.collectDefaultMetrics();
const httpRequests = new client.Counter({
  name: 'auth_http_requests_total',
  help: 'Auth service HTTP requests',
  labelNames: ['method', 'route', 'status']
});

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.on('finish', () => httpRequests.inc({ method: req.method, route: req.path, status: res.statusCode }));
  next();
});

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    create table if not exists auth_users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      password_hash text not null,
      created_at timestamptz default now()
    )
  `);
}

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'auth-service' }));
app.get('/metrics', async (_, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const passwordHash = await bcrypt.hash(password, 10);
  if (!pool) return res.status(201).json({ id: 'dev-user', email });
  const result = await pool.query(
    'insert into auth_users (email, password_hash) values ($1, $2) returning id, email',
    [email, passwordHash]
  );
  res.status(201).json(result.rows[0]);
});

app.post('/login', async (req, res) => {
  const { email = 'demo@example.com', password = 'password' } = req.body || {};
  let user = { id: 'demo-user', email, password_hash: await bcrypt.hash('password', 10) };
  if (pool) {
    const result = await pool.query('select * from auth_users where email = $1', [email]);
    if (result.rows[0]) user = result.rows[0];
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: '1h' });
  res.json({ token });
});

app.get('/validate', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ valid: false });
  try {
    res.json({ valid: true, user: jwt.verify(token, jwtSecret) });
  } catch {
    res.status(401).json({ valid: false });
  }
});

ensureSchema()
  .then(() => app.listen(port, () => console.log(`auth-service listening on ${port}`)))
  .catch((error) => {
    console.error('auth-service failed to start', error);
    process.exit(1);
  });

