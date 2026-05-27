import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import client from 'prom-client';

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

client.collectDefaultMetrics();
const httpRequests = new client.Counter({
  name: 'auth_http_requests_total',
  help: 'Auth service HTTP requests',
  labelNames: ['method', 'route', 'status']
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
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
      role text default 'user',
      created_at timestamptz default now()
    )
  `);
  // Add role column if it doesn't exist (for existing databases)
  await pool.query(`
    alter table auth_users add column if not exists role text default 'user'
  `);
}

async function seedAdmin() {
  if (!pool) return;
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    `insert into auth_users (email, password_hash, role)
     values ($1, $2, 'admin')
     on conflict (email) do update set password_hash = excluded.password_hash, role = 'admin'`,
    [adminEmail, passwordHash]
  );
  console.log(`Admin user seeded: ${adminEmail}`);
}

function setTokenCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 3600000 // 1 hour
  });
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
  if (!pool) {
    const token = jwt.sign({ sub: 'dev-user', email, role: 'user' }, jwtSecret, { expiresIn: '1h' });
    setTokenCookie(res, token);
    return res.status(201).json({ user: { id: 'dev-user', email, role: 'user' } });
  }
  try {
    const result = await pool.query(
      'insert into auth_users (email, password_hash, role) values ($1, $2, $3) returning id, email, role',
      [email, passwordHash, 'user']
    );
    const user = result.rows[0];
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: '1h' });
    setTokenCookie(res, token);
    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'email already registered' });
    throw error;
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  let user;
  if (pool) {
    const result = await pool.query('select id, email, password_hash, role from auth_users where email = $1', [email]);
    user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
  } else {
    // Dev mode: accept any login, admin email gets admin role
    user = {
      id: 'dev-user',
      email,
      password_hash: await bcrypt.hash(password, 10),
      role: email === adminEmail ? 'admin' : 'user'
    };
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'invalid credentials' });

  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: '1h' });
  setTokenCookie(res, token);
  res.json({ user: { id: user.id, email: user.email, role: user.role } });
});

app.post('/logout', (_, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'logged out' });
});

app.get('/validate', (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ valid: false });
  try {
    const user = jwt.verify(token, jwtSecret);
    res.json({ valid: true, user: { sub: user.sub, email: user.email, role: user.role || 'user' } });
  } catch {
    res.status(401).json({ valid: false });
  }
});

ensureSchema()
  .then(() => seedAdmin())
  .then(() => app.listen(port, () => console.log(`auth-service listening on ${port}`)))
  .catch((error) => {
    console.error('auth-service failed to start', error);
    process.exit(1);
  });
