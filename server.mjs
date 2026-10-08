import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const port = Number(process.env.PORT || 4178);
const staticRoot = resolve(process.env.LECTIO_DIST || 'dist');
const databasePath = resolve(process.env.LECTIO_DB_PATH || 'data/lectio.sqlite');
const sessionCookie = 'lectio_session';
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const maxBodyBytes = 32 * 1024;
const rateBuckets = new Map();

const sqliteSchema = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT 'Colombia',
    genres_json TEXT NOT NULL DEFAULT '[]',
    authors TEXT NOT NULL DEFAULT '',
    exchange_preference TEXT NOT NULL DEFAULT 'both',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reading_entries (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    page INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 1,
    note TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    condition TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('sale','exchange','both')),
    price INTEGER NOT NULL DEFAULT 0 CHECK(price >= 0),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exchange_requests (
    id TEXT PRIMARY KEY,
    offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offered_book TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','cancelled','blocked')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(offer_id, requester_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES exchange_requests(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(follower_id, followed_id),
    CHECK(follower_id <> followed_id)
  );
  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(blocker_id, blocked_id),
    CHECK(blocker_id <> blocked_id)
  );
  CREATE TABLE IF NOT EXISTS community_posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS likes (
    post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK(target_type IN ('user','post','message')),
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS event_reservations (
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(event_id, user_id)
  );
`;

const postgresSchema = sqliteSchema
  .replace(/^\s*PRAGMA[^;]+;\s*/gm, '')
  .replace(' COLLATE NOCASE', '')
  .replace(/\b(created_at|updated_at|expires_at) INTEGER\b/g, '$1 BIGINT');

let database;
let closeDatabase;
if (process.env.DATABASE_URL) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  await pool.query(postgresSchema);
  const postgresSql = (sql) => {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  };
  database = {
    prepare(sql) {
      const statement = postgresSql(sql);
      return {
        get: async (...params) => (await pool.query(statement, params)).rows[0],
        all: async (...params) => (await pool.query(statement, params)).rows,
        run: async (...params) => ({ changes: (await pool.query(statement, params)).rowCount || 0 }),
      };
    },
  };
  closeDatabase = () => pool.end();
} else {
  await mkdir(dirname(databasePath), { recursive: true });
  const sqlite = new DatabaseSync(databasePath);
  sqlite.exec(sqliteSchema);
  database = sqlite;
  closeDatabase = () => sqlite.close();
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const hash = (value) => createHash('sha256').update(value).digest('hex');
const now = () => Date.now();
const contactPattern = /(?:[\w.+-]+@[\w.-]+\.[A-Z]{2,}|\b(?:https?:\/\/|www\.)\S+|\b(?:\+?57[\s().-]?)?(?:3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}|60[1-8][\s.-]?\d{7})\b|\b(?:calle|cll\.?|carrera|cra\.?|avenida|av\.?|diagonal|diag\.?|transversal|tv\.?)\s+\d{1,3}\s*#\s*\d+|\b(?:contraseña|clave|cvc|cvv)\s*[:=]|\b(?:cédula|documento|tarjeta)\D{0,5}\d{6,16})/i;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

function setSecurityHeaders(response, request, isApi = false) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', contentSecurityPolicy);
  response.setHeader('Cache-Control', isApi ? 'no-store' : 'no-cache');
  if (request.headers['x-forwarded-proto'] === 'https' || request.socket.encrypted) {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

function sendJson(response, request, status, payload, extraHeaders = {}) {
  setSecurityHeaders(response, request, true);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  response.end(JSON.stringify(payload));
}

function fail(status, message) {
  throw new HttpError(status, message);
}

async function readJson(request) {
  const contentType = request.headers['content-type'] || '';
  if (!contentType.toLowerCase().includes('application/json')) fail(415, 'Se requiere application/json.');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) fail(413, 'La solicitud supera el tamaño permitido.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'El cuerpo debe ser un objeto JSON.');
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(400, 'JSON inválido.');
  }
}

function textField(value, label, min, max, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string') fail(400, `${label} no es válido.`);
  const text = value.trim();
  if (text.length < min || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    fail(400, `${label} debe tener entre ${min} y ${max} caracteres válidos.`);
  }
  return text;
}

function checkNoContact(text) {
  if (contactPattern.test(text)) fail(400, 'Por seguridad, no compartas teléfonos, correos, direcciones, enlaces ni credenciales.');
}

function rateLimit(request, key, limit, windowMs) {
  const ip = request.socket.remoteAddress || 'unknown';
  const bucketKey = `${key}:${ip}`;
  const time = now();
  const current = rateBuckets.get(bucketKey);
  if (!current || time >= current.until) {
    rateBuckets.set(bucketKey, { count: 1, until: time + windowMs });
    return;
  }
  if (current.count >= limit) fail(429, 'Demasiados intentos. Espera un momento y vuelve a probar.');
  current.count += 1;
  if (rateBuckets.size > 5000) {
    for (const [entry, value] of rateBuckets) if (time >= value.until) rateBuckets.delete(entry);
  }
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  let originHost;
  try { originHost = new URL(origin).host; }
  catch { fail(403, 'Origen no válido.'); }
  if (originHost !== request.headers.host) fail(403, 'Origen no permitido.');
}

function cookieValue(request, name) {
  const cookies = request.headers.cookie || '';
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return '';
}

async function getSession(request) {
  const token = cookieValue(request, sessionCookie);
  if (!token || token.length > 128) return null;
  const row = await database.prepare(`
    SELECT s.token_hash, s.csrf_token, s.expires_at, u.id, u.name, u.email, u.city,
      u.genres_json, u.authors, u.exchange_preference
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hash(token), now());
  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    csrfToken: row.csrf_token,
    expiresAt: row.expires_at,
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      city: row.city,
      genres: JSON.parse(row.genres_json),
      authors: row.authors,
      exchangePreference: row.exchange_preference,
    },
  };
}

async function requireSession(request) {
  const session = await getSession(request);
  if (!session) fail(401, 'Inicia sesión para continuar.');
  return session;
}

function requireCsrf(request, session) {
  assertSameOrigin(request);
  const supplied = request.headers['x-csrf-token'];
  if (typeof supplied !== 'string') fail(403, 'Token CSRF requerido.');
  const left = Buffer.from(supplied);
  const right = Buffer.from(session.csrfToken);
  if (left.length !== right.length || !timingSafeEqual(left, right)) fail(403, 'Token CSRF inválido.');
}

function setSessionCookie(response, request, token, maxAge) {
  const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function clearSessionCookie(response, request) {
  const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

async function createSession(response, request, userId) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = now() + sessionLifetime;
  await database.prepare('INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)')
    .run(hash(token), userId, csrfToken, expiresAt);
  setSessionCookie(response, request, token, Math.floor(sessionLifetime / 1000));
  return csrfToken;
}

function verifyPassword(password, saltHex, hashHex) {
  const expected = Buffer.from(hashHex, 'hex');
  const supplied = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function normalizeEmail(value) {
  const email = textField(value, 'Correo', 5, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Escribe un correo válido.');
  return email;
}

async function ensureNotBlocked(userId, otherId) {
  const block = await database.prepare(`
    SELECT 1 FROM blocks
    WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
  `).get(userId, otherId, otherId, userId);
  if (block) fail(403, 'Esta interacción no está disponible.');
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    genres: JSON.parse(row.genres_json),
    authors: row.authors,
  };
}

async function getBootstrap(userId) {
  const userRow = await database.prepare(`
    SELECT id, name, email, city, genres_json, authors, exchange_preference
    FROM users WHERE id = ?
  `).get(userId);
  const user = {
    ...publicUser(userRow),
    email: userRow.email,
    exchangePreference: userRow.exchange_preference,
  };
  const offers = await database.prepare(`
    SELECT o.id, o.user_id AS ownerId, o.title, o.author, o.condition, o.mode, o.price, o.status,
      o.created_at AS createdAt, u.name AS owner, u.city
    FROM offers o JOIN users u ON u.id = o.user_id
    WHERE o.status = 'open'
      AND NOT EXISTS (
        SELECT 1 FROM blocks b WHERE
          (b.blocker_id = ? AND b.blocked_id = o.user_id) OR
          (b.blocker_id = o.user_id AND b.blocked_id = ?)
      )
    ORDER BY o.created_at DESC LIMIT 100
  `).all(userId, userId);
  const incomingRequests = (await database.prepare(`
    SELECT r.id, r.offer_id AS offerId, r.requester_id AS readerId, r.offered_book AS offeredBook,
      r.status, r.created_at AS createdAt, o.title, u.name AS reader, u.city
    FROM exchange_requests r
    JOIN offers o ON o.id = r.offer_id
    JOIN users u ON u.id = r.requester_id
    WHERE r.owner_id = ? ORDER BY r.created_at DESC LIMIT 100
  `).all(userId)).map((request) => ({ ...request, reader: `${request.reader} · ${request.city}` }));
  const sentRequests = (await database.prepare(`
    SELECT r.id, r.offer_id AS offerId, r.status, r.created_at AS createdAt,
      o.title AS bookTitle, u.name AS recipient
    FROM exchange_requests r
    JOIN offers o ON o.id = r.offer_id
    JOIN users u ON u.id = r.owner_id
    WHERE r.requester_id = ? ORDER BY r.created_at DESC LIMIT 100
  `).all(userId)).map((request) => ({ ...request, to: request.recipient }));
  const posts = await database.prepare(`
    SELECT p.id, p.user_id AS authorId, p.book, p.body AS text, p.created_at AS createdAt,
      u.name AS author, u.city
    FROM community_posts p JOIN users u ON u.id = p.user_id
    WHERE NOT EXISTS (
      SELECT 1 FROM blocks b WHERE
        (b.blocker_id = ? AND b.blocked_id = p.user_id) OR
        (b.blocker_id = p.user_id AND b.blocked_id = ?)
    )
    ORDER BY p.created_at DESC LIMIT 60
  `).all(userId, userId);
  const postIds = posts.map((post) => post.id);
  const comments = {};
  const likes = (await database.prepare('SELECT post_id FROM likes WHERE user_id = ?').all(userId)).map((row) => row.post_id);
  for (const postId of postIds) {
    comments[postId] = await database.prepare(`
      SELECT c.id, c.body AS text, c.created_at AS createdAt, u.name AS author
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ? ORDER BY c.created_at ASC LIMIT 100
    `).all(postId);
  }
  const following = (await database.prepare('SELECT followed_id FROM follows WHERE follower_id = ?').all(userId)).map((row) => row.followed_id);
  const blockedUsers = (await database.prepare('SELECT blocked_id FROM blocks WHERE blocker_id = ?').all(userId)).map((row) => row.blocked_id);
  const blockedReaders = await database.prepare(`
    SELECT u.id, u.name FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?
  `).all(userId);
  const readers = (await database.prepare(`
    SELECT u.id, u.name, u.city, u.genres_json
    FROM users u
    WHERE u.id <> ?
      AND NOT EXISTS (
        SELECT 1 FROM blocks b WHERE
          (b.blocker_id = ? AND b.blocked_id = u.id) OR
          (b.blocker_id = u.id AND b.blocked_id = ?)
      )
    ORDER BY u.created_at DESC LIMIT 50
  `).all(userId, userId, userId)).map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city,
    genres: JSON.parse(row.genres_json),
    following: following.includes(row.id),
  }));
  const readingRow = await database.prepare(`
    SELECT title, author, page, total, note, updated_at AS updatedAt
    FROM reading_entries WHERE user_id = ?
  `).get(userId);
  return {
    user,
    offers,
    incomingRequests,
    sentRequests,
    posts,
    comments,
    likes,
    following,
    blockedUsers,
    blockedReaders,
    readers,
    reading: readingRow || null,
    reservedEvents: (await database.prepare('SELECT event_id FROM event_reservations WHERE user_id = ?').all(userId)).map((row) => row.event_id),
  };
}

async function requireRequestParticipant(requestId, userId) {
  const request = await database.prepare(`
    SELECT id, requester_id AS requesterId, owner_id AS ownerId, status
    FROM exchange_requests WHERE id = ?
  `).get(requestId);
  if (!request || (request.requesterId !== userId && request.ownerId !== userId)) fail(404, 'La solicitud no está disponible.');
  await ensureNotBlocked(request.requesterId, request.ownerId);
  if (request.status !== 'accepted') fail(403, 'El chat requiere una solicitud aceptada.');
  return request;
}

async function handleAuth(request, response, url) {
  const pathname = url.pathname;
  if (request.method === 'POST' && pathname === '/api/auth/register') {
    assertSameOrigin(request);
    rateLimit(request, 'register', 5, 15 * 60 * 1000);
    const body = await readJson(request);
    const name = textField(body.name, 'Nombre', 2, 70);
    const email = normalizeEmail(body.email);
    const password = textField(body.password, 'Contraseña', 12, 128);
    const genres = Array.isArray(body.genres) ? body.genres.filter((item) => typeof item === 'string').slice(0, 12) : [];
    const allowedPreferences = new Set(['sale', 'exchange', 'both']);
    const exchangePreference = allowedPreferences.has(body.exchangePreference) ? body.exchangePreference : 'both';
    const authors = textField(body.authors || '', 'Autores', 0, 300, true);
    const userId = randomUUID();
    const salt = randomBytes(16);
    const passwordHash = scryptSync(password, salt, 64);
    try {
      await database.prepare(`
        INSERT INTO users (id, name, email, password_salt, password_hash, genres_json, authors, exchange_preference, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, name, email, salt.toString('hex'), passwordHash.toString('hex'), JSON.stringify(genres), authors, exchangePreference, now());
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) fail(409, 'Ya existe una cuenta con ese correo. Inicia sesión.');
      throw error;
    }
    const csrfToken = await createSession(response, request, userId);
    return sendJson(response, request, 201, { user: (await getBootstrap(userId)).user, csrfToken });
  }
  if (request.method === 'POST' && pathname === '/api/auth/login') {
    assertSameOrigin(request);
    rateLimit(request, 'login', 10, 15 * 60 * 1000);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const password = textField(body.password, 'Contraseña', 1, 128);
    const user = await database.prepare('SELECT id, password_salt, password_hash FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) fail(401, 'Correo o contraseña incorrectos.');
    const csrfToken = await createSession(response, request, user.id);
    return sendJson(response, request, 200, { user: (await getBootstrap(user.id)).user, csrfToken });
  }
  if (request.method === 'GET' && pathname === '/api/auth/me') {
    const session = await getSession(request);
    if (!session) return sendJson(response, request, 200, { authenticated: false });
    return sendJson(response, request, 200, { authenticated: true, user: session.user, csrfToken: session.csrfToken });
  }
  if (request.method === 'POST' && pathname === '/api/auth/logout') {
    const session = await requireSession(request);
    requireCsrf(request, session);
    await database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(session.tokenHash);
    clearSessionCookie(response, request);
    return sendJson(response, request, 200, { ok: true });
  }
  return false;
}

async function handleApi(request, response, url) {
  const authResult = await handleAuth(request, response, url);
  if (authResult !== false) return;
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, request, 200, { ok: true, service: 'lectio-api' });
  }

  const session = await requireSession(request);
  const userId = session.user.id;
  const method = request.method;
  const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) requireCsrf(request, session);

  if (method === 'GET' && url.pathname === '/api/bootstrap') {
    return sendJson(response, request, 200, await getBootstrap(userId));
  }

  if (method === 'PUT' && url.pathname === '/api/profile') {
    const body = await readJson(request);
    const name = textField(body.name, 'Nombre', 2, 70);
    const city = textField(body.city || 'Colombia', 'Ciudad', 2, 80);
    const authors = textField(body.authors || '', 'Autores', 0, 300, true);
    const genres = Array.isArray(body.genres)
      ? [...new Set(body.genres.filter((genre) => typeof genre === 'string').map((genre) => genre.trim()).filter(Boolean))].slice(0, 12)
      : [];
    const preference = ['sale', 'exchange', 'both'].includes(body.exchangePreference) ? body.exchangePreference : 'both';
    await database.prepare(`UPDATE users SET name=?,city=?,genres_json=?,authors=?,exchange_preference=? WHERE id=?`)
      .run(name, city, JSON.stringify(genres), authors, preference, userId);
    return sendJson(response, request, 200, { user: (await getBootstrap(userId)).user });
  }

  if (method === 'PUT' && url.pathname === '/api/reading') {
    const body = await readJson(request);
    const title = textField(body.title, 'Título', 1, 100);
    const author = textField(body.author || '', 'Autor', 0, 100, true);
    const note = textField(body.note || '', 'Nota', 0, 1200, true);
    const page = Number(body.page);
    const total = Number(body.total);
    if (!Number.isInteger(page) || !Number.isInteger(total) || total < 1 || page < 0 || page > total) fail(400, 'El avance de lectura no es válido.');
    await database.prepare(`
      INSERT INTO reading_entries (user_id, title, author, page, total, note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET title=excluded.title, author=excluded.author,
        page=excluded.page, total=excluded.total, note=excluded.note, updated_at=excluded.updated_at
    `).run(userId, title, author, page, total, note, now());
    return sendJson(response, request, 200, { ok: true });
  }

  if (method === 'POST' && url.pathname === '/api/offers') {
    rateLimit(request, `offers:${userId}`, 10, 60 * 60 * 1000);
    const body = await readJson(request);
    const title = textField(body.title, 'Título', 1, 100);
    const author = textField(body.author, 'Autor', 1, 100);
    checkNoContact(`${title} ${author}`);
    const condition = textField(body.condition, 'Estado', 2, 40);
    const mode = body.mode;
    if (!['sale', 'exchange', 'both'].includes(mode)) fail(400, 'La modalidad no es válida.');
    const price = Number(body.price || 0);
    if (!Number.isSafeInteger(price) || price < 0 || (mode !== 'exchange' && price < 500)) fail(400, 'El precio debe ser mayor que cero para una venta.');
    const id = randomUUID();
    await database.prepare(`INSERT INTO offers (id,user_id,title,author,condition,mode,price,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, userId, title, author, condition, mode, price, now());
    return sendJson(response, request, 201, { offer: await database.prepare('SELECT * FROM offers WHERE id = ?').get(id) });
  }

  if (parts[0] === 'api' && parts[1] === 'offers' && parts.length === 3 && method === 'DELETE') {
    const offerId = parts[2];
    const result = await database.prepare(`UPDATE offers SET status='closed' WHERE id=? AND user_id=? AND status='open'`).run(offerId, userId);
    if (!result.changes) fail(404, 'La oferta no está disponible.');
    await database.prepare(`UPDATE exchange_requests SET status='cancelled', updated_at=? WHERE offer_id=? AND status='pending'`).run(now(), offerId);
    return sendJson(response, request, 200, { ok: true });
  }

  if (parts[0] === 'api' && parts[1] === 'offers' && parts.length === 4 && parts[3] === 'requests' && method === 'POST') {
    rateLimit(request, `requests:${userId}`, 12, 60 * 60 * 1000);
    const offer = await database.prepare(`SELECT id,user_id,title,mode,status FROM offers WHERE id=?`).get(parts[2]);
    if (!offer || offer.status !== 'open' || offer.mode === 'sale' || offer.user_id === userId) fail(404, 'La oferta no está disponible para intercambio.');
    await ensureNotBlocked(userId, offer.user_id);
    const body = await readJson(request);
    const offeredBook = textField(body.offeredBook, 'Libro ofrecido', 1, 100);
    checkNoContact(offeredBook);
    const id = randomUUID();
    try {
      await database.prepare(`INSERT INTO exchange_requests (id,offer_id,requester_id,owner_id,offered_book,status,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?)`)
        .run(id, offer.id, userId, offer.user_id, offeredBook, now(), now());
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) fail(409, 'Ya enviaste una solicitud para esta oferta.');
      throw error;
    }
    return sendJson(response, request, 201, { id, status: 'pending' });
  }

  if (parts[0] === 'api' && parts[1] === 'requests' && parts.length === 4 && parts[3] === 'decision' && method === 'POST') {
    const body = await readJson(request);
    const decision = body.decision;
    if (!['accept', 'reject'].includes(decision)) fail(400, 'La decisión no es válida.');
    const requestRow = await database.prepare(`SELECT id, requester_id, owner_id, status FROM exchange_requests WHERE id=?`).get(parts[2]);
    if (!requestRow || requestRow.owner_id !== userId || requestRow.status !== 'pending') fail(404, 'La solicitud no está disponible.');
    await ensureNotBlocked(userId, requestRow.requester_id);
    await database.prepare(`UPDATE exchange_requests SET status=?, updated_at=? WHERE id=? AND owner_id=? AND status='pending'`)
      .run(decision === 'accept' ? 'accepted' : 'rejected', now(), requestRow.id, userId);
    return sendJson(response, request, 200, { ok: true, status: decision === 'accept' ? 'accepted' : 'rejected' });
  }

  if (parts[0] === 'api' && parts[1] === 'requests' && parts.length === 4 && parts[3] === 'cancel' && method === 'POST') {
    const requestRow = await database.prepare(`SELECT id,requester_id,status FROM exchange_requests WHERE id=?`).get(parts[2]);
    if (!requestRow || requestRow.requester_id !== userId || requestRow.status !== 'pending') fail(404, 'La solicitud no está disponible para cancelar.');
    await database.prepare(`UPDATE exchange_requests SET status='cancelled',updated_at=? WHERE id=? AND requester_id=? AND status='pending'`)
      .run(now(), requestRow.id, userId);
    return sendJson(response, request, 200, { ok: true, status: 'cancelled' });
  }

  if (parts[0] === 'api' && parts[1] === 'requests' && parts.length === 4 && parts[3] === 'messages') {
    const exchange = await requireRequestParticipant(parts[2], userId);
    if (method === 'GET') {
      const messages = await database.prepare(`
        SELECT m.id,m.body AS text,m.created_at AS createdAt,m.sender_id AS senderId,u.name AS author
        FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.request_id=? ORDER BY m.created_at ASC LIMIT 200
      `).all(exchange.id);
      return sendJson(response, request, 200, { messages });
    }
    if (method === 'POST') {
      rateLimit(request, `messages:${userId}`, 30, 60 * 1000);
      const body = await readJson(request);
      const message = textField(body.text, 'Mensaje', 1, 600);
      checkNoContact(message);
      const id = randomUUID();
      await database.prepare('INSERT INTO messages (id,request_id,sender_id,body,created_at) VALUES (?,?,?,?,?)')
        .run(id, exchange.id, userId, message, now());
      return sendJson(response, request, 201, { id });
    }
  }

  if (method === 'POST' && url.pathname === '/api/community/posts') {
    rateLimit(request, `posts:${userId}`, 8, 60 * 60 * 1000);
    const body = await readJson(request);
    const text = textField(body.text, 'Publicación', 1, 500);
    const book = textField(body.book || '', 'Libro', 0, 100, true);
    checkNoContact(`${text} ${book}`);
    const id = randomUUID();
    await database.prepare('INSERT INTO community_posts (id,user_id,book,body,created_at) VALUES (?,?,?,?,?)').run(id, userId, book, text, now());
    return sendJson(response, request, 201, { id });
  }

  if (parts[0] === 'api' && parts[1] === 'community' && parts[2] === 'posts' && parts.length === 5 && parts[4] === 'comments' && method === 'POST') {
    rateLimit(request, `comments:${userId}`, 30, 60 * 60 * 1000);
    const post = await database.prepare('SELECT id,user_id FROM community_posts WHERE id=?').get(parts[3]);
    if (!post) fail(404, 'La publicación no está disponible.');
    await ensureNotBlocked(userId, post.user_id);
    const body = await readJson(request);
    const text = textField(body.text, 'Comentario', 1, 280);
    checkNoContact(text);
    const id = randomUUID();
    await database.prepare('INSERT INTO comments (id,post_id,user_id,body,created_at) VALUES (?,?,?,?,?)').run(id, post.id, userId, text, now());
    return sendJson(response, request, 201, { id });
  }

  if (parts[0] === 'api' && parts[1] === 'community' && parts[2] === 'posts' && parts.length === 5 && parts[4] === 'like' && method === 'POST') {
    const post = await database.prepare('SELECT id,user_id FROM community_posts WHERE id=?').get(parts[3]);
    if (!post) fail(404, 'La publicación no está disponible.');
    await ensureNotBlocked(userId, post.user_id);
    const existing = await database.prepare('SELECT 1 FROM likes WHERE post_id=? AND user_id=?').get(post.id, userId);
    if (existing) await database.prepare('DELETE FROM likes WHERE post_id=? AND user_id=?').run(post.id, userId);
    else await database.prepare('INSERT INTO likes (post_id,user_id,created_at) VALUES (?,?,?)').run(post.id, userId, now());
    return sendJson(response, request, 200, { liked: !existing });
  }

  if (parts[0] === 'api' && parts[1] === 'community' && parts[2] === 'follows' && parts.length === 4 && method === 'POST') {
    const targetId = parts[3];
    if (targetId === userId) fail(400, 'No puedes seguir tu propio perfil.');
    if (!await database.prepare('SELECT 1 FROM users WHERE id=?').get(targetId)) fail(404, 'El perfil no está disponible.');
    await ensureNotBlocked(userId, targetId);
    const existing = await database.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followed_id=?').get(userId, targetId);
    if (existing) await database.prepare('DELETE FROM follows WHERE follower_id=? AND followed_id=?').run(userId, targetId);
    else await database.prepare('INSERT INTO follows (follower_id,followed_id,created_at) VALUES (?,?,?)').run(userId, targetId, now());
    return sendJson(response, request, 200, { following: !existing });
  }

  if (parts[0] === 'api' && parts[1] === 'community' && parts[2] === 'blocks' && parts.length === 4 && method === 'POST') {
    const targetId = parts[3];
    if (targetId === userId) fail(400, 'No puedes bloquear tu propio perfil.');
    if (!await database.prepare('SELECT 1 FROM users WHERE id=?').get(targetId)) fail(404, 'El perfil no está disponible.');
    const existing = await database.prepare('SELECT 1 FROM blocks WHERE blocker_id=? AND blocked_id=?').get(userId, targetId);
    if (existing) {
      await database.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(userId, targetId);
    } else {
      await database.prepare('INSERT INTO blocks (blocker_id,blocked_id,created_at) VALUES (?,?,?)').run(userId, targetId, now());
      await database.prepare('DELETE FROM follows WHERE (follower_id=? AND followed_id=?) OR (follower_id=? AND followed_id=?)').run(userId, targetId, targetId, userId);
      await database.prepare(`UPDATE exchange_requests SET status='blocked',updated_at=? WHERE ((requester_id=? AND owner_id=?) OR (requester_id=? AND owner_id=?)) AND status IN ('pending','accepted')`)
        .run(now(), userId, targetId, targetId, userId);
    }
    return sendJson(response, request, 200, { blocked: !existing });
  }

  if (method === 'POST' && url.pathname === '/api/community/reports') {
    rateLimit(request, `reports:${userId}`, 10, 60 * 60 * 1000);
    const body = await readJson(request);
    const targetType = body.targetType;
    const targetId = textField(body.targetId, 'Elemento reportado', 1, 100);
    const reason = ['spam','harassment','personal_data','scam','other'].includes(body.reason) ? body.reason : 'other';
    let targetUserId = targetType === 'user' ? targetId : '';
    if (targetType === 'post') targetUserId = (await database.prepare('SELECT user_id FROM community_posts WHERE id=?').get(targetId))?.user_id || '';
    if (targetType === 'message') {
      const message = await database.prepare(`
        SELECT sender_id AS senderId, requester_id AS requesterId, owner_id AS ownerId
        FROM messages m JOIN exchange_requests r ON r.id=m.request_id WHERE m.id=?
      `).get(targetId);
      if (message && [message.requesterId, message.ownerId].includes(userId)) {
        targetUserId = message.senderId === userId
          ? message.requesterId === userId ? message.ownerId : message.requesterId
          : message.senderId;
      }
    }
    if (!['user','post','message'].includes(targetType) || !targetUserId || targetUserId === userId) fail(404, 'El elemento no está disponible para reportar.');
    await database.prepare('INSERT INTO reports (id,reporter_id,target_user_id,target_type,target_id,reason,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(randomUUID(), userId, targetUserId, targetType, targetId, reason, now());
    return sendJson(response, request, 201, { ok: true });
  }

  if (method === 'POST' && url.pathname === '/api/community/reservations') {
    const body = await readJson(request);
    const eventId = textField(body.eventId, 'Encuentro', 1, 100);
    await database.prepare('INSERT INTO event_reservations (event_id,user_id,created_at) VALUES (?,?,?) ON CONFLICT (event_id,user_id) DO NOTHING').run(eventId, userId, now());
    return sendJson(response, request, 201, { reserved: true, charged: false });
  }

  fail(404, 'Ruta API no encontrada.');
}

async function serveStatic(request, response, url) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return sendJson(response, request, 405, { error: 'Método no permitido.' }, { Allow: 'GET, HEAD' });
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return sendJson(response, request, 400, { error: 'Ruta inválida.' }); }
  if (pathname.includes('\0')) return sendJson(response, request, 400, { error: 'Ruta inválida.' });
  const target = resolve(staticRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (target !== staticRoot && !target.startsWith(`${staticRoot}${sep}`)) return sendJson(response, request, 404, { error: 'No encontrado.' });
  try {
    const details = await stat(target);
    if (!details.isFile()) return sendJson(response, request, 404, { error: 'No encontrado.' });
    const body = await readFile(target);
    setSecurityHeaders(response, request);
    response.setHeader('Content-Type', mimeTypes[extname(target).toLowerCase()] || 'application/octet-stream');
    if (extname(target) !== '.html' && target.includes(`${sep}assets${sep}`)) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.writeHead(200);
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    response.end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
    else await serveStatic(request, response, url);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (!(error instanceof HttpError)) console.error('Lectio request failed:', error.message);
    sendJson(response, request, status, { error: error instanceof HttpError ? error.message : 'Error interno del servidor.' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Lectio API + static app listening on http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      Promise.resolve(closeDatabase()).finally(() => process.exit(0));
    });
  });
}