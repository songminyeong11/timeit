export type AuthEnv = {
  DB?: D1Database;
};

type AuthUser = {
  id: string;
  email: string;
  name: string;
};

const SESSION_COOKIE = "timeit_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 100_000;
const encoder = new TextEncoder();

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomToken(size = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

async function sha256(value: string) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

function safeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

function sessionCookie(token: string, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS user_data (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)"),
  ]);
}

async function currentUser(request: Request, db: D1Database): Promise<AuthUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await db.prepare(
    "SELECT users.id, users.email, users.display_name AS name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
  ).bind(tokenHash, now).first<AuthUser>();
  if (!row) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  return row ?? null;
}

async function createSession(db: D1Database, user: AuthUser) {
  const token = randomToken();
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), user.id, Date.now() + SESSION_SECONDS * 1000, Date.now())
    .run();
  return json({ user }, 200, { "Set-Cookie": sessionCookie(token) });
}

function validOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function handleAuthRequest(request: Request, env: AuthEnv) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/") && url.pathname !== "/api/user-data") return null;
  if (!env.DB) return json({ error: "로그인 저장소가 아직 연결되지 않았어요." }, 503);
  if (request.method !== "GET" && !validOrigin(request)) return json({ error: "허용되지 않은 요청이에요." }, 403);

  const db = env.DB;
  await ensureSchema(db);

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    return json({ user: await currentUser(request, db) });
  }

  if (url.pathname === "/api/auth/signup" && request.method === "POST") {
    const body = await request.json().catch(() => null) as { name?: unknown; email?: unknown; password?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (name.length < 2 || name.length > 24) return json({ error: "이름은 2~24자로 입력해 주세요." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return json({ error: "올바른 이메일을 입력해 주세요." }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "비밀번호는 8자 이상 입력해 주세요." }, 400);
    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existing) return json({ error: "이미 가입된 이메일이에요." }, 409);
    const user = { id: crypto.randomUUID(), email, name };
    const salt = randomToken(16);
    await db.prepare("INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(user.id, user.email, user.name, await passwordHash(password, salt), salt, Date.now())
      .run();
    return createSession(db, user);
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const row = await db.prepare("SELECT id, email, display_name AS name, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE email = ?")
      .bind(email)
      .first<AuthUser & { passwordHash: string; passwordSalt: string }>();
    const candidateHash = await passwordHash(password, row?.passwordSalt ?? "timeit-invalid-account-salt");
    if (!row || !safeEqual(candidateHash, row.passwordHash)) {
      return json({ error: "이메일 또는 비밀번호를 확인해 주세요." }, 401);
    }
    return createSession(db, { id: row.id, email: row.email, name: row.name });
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  }

  if (url.pathname === "/api/user-data") {
    const user = await currentUser(request, db);
    if (!user) return json({ error: "로그인이 필요해요." }, 401);
    if (request.method === "GET") {
      const row = await db.prepare("SELECT payload, updated_at AS updatedAt FROM user_data WHERE user_id = ?").bind(user.id).first<{ payload: string; updatedAt: number }>();
      return json({ data: row ? JSON.parse(row.payload) : null, updatedAt: row?.updatedAt ?? null });
    }
    if (request.method === "PUT") {
      const body = await request.text();
      if (body.length > 1_000_000) return json({ error: "저장할 데이터가 너무 커요." }, 413);
      let parsed: { data?: unknown } | null = null;
      try {
        parsed = JSON.parse(body) as { data?: unknown };
      } catch {
        return json({ error: "저장 형식이 올바르지 않아요." }, 400);
      }
      if (!parsed || typeof parsed !== "object" || !("data" in parsed)) return json({ error: "저장 형식이 올바르지 않아요." }, 400);
      const payload = JSON.stringify(parsed.data);
      await db.prepare("INSERT INTO user_data (user_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at")
        .bind(user.id, payload, Date.now())
        .run();
      return json({ ok: true });
    }
  }

  return json({ error: "지원하지 않는 요청이에요." }, 404);
}
