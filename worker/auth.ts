import { createRemoteJWKSet, jwtVerify } from "jose";

export type AuthEnv = {
  DB?: D1Database;
};

type AuthUser = {
  id: string;
  email: string;
  name: string;
  authProvider: "password" | "google" | "password+google";
};

const GOOGLE_CLIENT_ID = "322831832887-fm9l7tdqbp1qgfd6v52rirbt4b1nmdt6.apps.googleusercontent.com";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const SESSION_COOKIE = "timeit_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 100_000;
const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_ATTEMPT_LIMIT = 8;
const AUTH_LOCK_MS = 15 * 60 * 1000;
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

async function readJsonBody<T>(request: Request, maxBytes = 16_384): Promise<T | null> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > maxBytes) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
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
    db.prepare("CREATE TABLE IF NOT EXISTS auth_attempts (attempt_key TEXT PRIMARY KEY NOT NULL, failures INTEGER NOT NULL, window_started_at INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_attempts_locked_until_idx ON auth_attempts(locked_until)"),
  ]);
  const userColumns = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  const columnNames = new Set((userColumns.results ?? []).map((column) => column.name));
  if (!columnNames.has("recovery_hash")) await db.prepare("ALTER TABLE users ADD COLUMN recovery_hash TEXT").run();
  if (!columnNames.has("recovery_salt")) await db.prepare("ALTER TABLE users ADD COLUMN recovery_salt TEXT").run();
  if (!columnNames.has("google_sub")) await db.prepare("ALTER TABLE users ADD COLUMN google_sub TEXT").run();
  if (!columnNames.has("auth_provider")) await db.prepare("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub)").run();
}

async function currentUser(request: Request, db: D1Database): Promise<AuthUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await db.prepare(
    "SELECT users.id, users.email, users.display_name AS name, users.auth_provider AS authProvider FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
  ).bind(tokenHash, now).first<AuthUser>();
  if (!row) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  return row ?? null;
}

async function createSession(db: D1Database, user: AuthUser) {
  const token = randomToken();
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256(token), user.id, now + SESSION_SECONDS * 1000, now),
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM auth_attempts WHERE locked_until < ? AND window_started_at < ?")
      .bind(now, now - AUTH_ATTEMPT_WINDOW_MS * 2),
  ]);
  return json({ user }, 200, { "Set-Cookie": sessionCookie(token) });
}

function validOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function recoveryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(random, (value) => alphabet[value % alphabet.length])
    .join("")
    .match(/.{1,4}/g)!
    .join("-");
}

async function authAttemptKey(kind: "login" | "recovery", email: string, request: Request) {
  const clientAddress = request.headers.get("CF-Connecting-IP") ?? "unknown";
  return sha256(`${kind}:${email}:${clientAddress}`);
}

async function authLockRemaining(db: D1Database, attemptKey: string) {
  const row = await db.prepare("SELECT locked_until AS lockedUntil FROM auth_attempts WHERE attempt_key = ?")
    .bind(attemptKey)
    .first<{ lockedUntil: number }>();
  return Math.max(0, (row?.lockedUntil ?? 0) - Date.now());
}

async function recordAuthFailure(db: D1Database, attemptKey: string) {
  const now = Date.now();
  await db.prepare(
    `INSERT INTO auth_attempts (attempt_key, failures, window_started_at, locked_until)
     VALUES (?, 1, ?, 0)
     ON CONFLICT(attempt_key) DO UPDATE SET
       locked_until = CASE WHEN ? - window_started_at < ? AND failures + 1 >= ? THEN ? ELSE 0 END,
       failures = CASE WHEN ? - window_started_at < ? THEN failures + 1 ELSE 1 END,
       window_started_at = CASE WHEN ? - window_started_at < ? THEN window_started_at ELSE ? END`,
  ).bind(
    attemptKey,
    now,
    now, AUTH_ATTEMPT_WINDOW_MS, AUTH_ATTEMPT_LIMIT, now + AUTH_LOCK_MS,
    now, AUTH_ATTEMPT_WINDOW_MS,
    now, AUTH_ATTEMPT_WINDOW_MS, now,
  ).run();
}

async function clearAuthFailures(db: D1Database, attemptKey: string) {
  await db.prepare("DELETE FROM auth_attempts WHERE attempt_key = ?").bind(attemptKey).run();
}

async function verifiedPasswordUser(db: D1Database, userId: string, password: string) {
  const row = await db.prepare(
    "SELECT id, email, display_name AS name, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE id = ?",
  ).bind(userId).first<AuthUser & { passwordHash: string; passwordSalt: string }>();
  const candidateHash = await passwordHash(password, row?.passwordSalt ?? "timeit-invalid-account-salt");
  return row && safeEqual(candidateHash, row.passwordHash) ? row : null;
}

async function verifiedGoogleIdentity(credential: string) {
  if (!credential || credential.length > 8_192) return null;
  try {
    const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
      audience: GOOGLE_CLIENT_ID,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 24) : "";
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";
    const hostedDomain = typeof payload.hd === "string" ? payload.hd : "";
    if (!sub || !email || !emailVerified || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return {
      sub,
      email,
      name: name.length >= 2 ? name : email.split("@")[0].slice(0, 24),
      authoritativeEmail: email.endsWith("@gmail.com") || Boolean(hostedDomain),
    };
  } catch {
    return null;
  }
}

export async function handleAuthRequest(request: Request, env: AuthEnv) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/") && !url.pathname.startsWith("/api/account/") && url.pathname !== "/api/user-data") return null;
  if (!env.DB) return json({ error: "로그인 저장소가 아직 연결되지 않았어요." }, 503);
  if (request.method !== "GET" && !validOrigin(request)) return json({ error: "허용되지 않은 요청이에요." }, 403);

  const db = env.DB;
  await ensureSchema(db);

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    return json({ user: await currentUser(request, db) });
  }

  if (url.pathname === "/api/auth/google" && request.method === "POST") {
    const body = await readJsonBody<{ credential?: unknown }>(request);
    const credential = typeof body?.credential === "string" ? body.credential : "";
    const identity = await verifiedGoogleIdentity(credential);
    if (!identity) return json({ error: "Google 로그인을 확인하지 못했어요. 다시 시도해 주세요." }, 401);

    let row = await db.prepare(
      "SELECT id, email, display_name AS name, auth_provider AS authProvider FROM users WHERE google_sub = ?",
    ).bind(identity.sub).first<AuthUser>();

    if (!row) {
      const emailUser = await db.prepare(
        "SELECT id, email, display_name AS name, auth_provider AS authProvider, google_sub AS googleSub FROM users WHERE email = ?",
      ).bind(identity.email).first<AuthUser & { googleSub: string | null }>();
      if (emailUser) {
        if (emailUser.googleSub && emailUser.googleSub !== identity.sub) {
          return json({ error: "이 이메일은 다른 Google 계정과 연결되어 있어요." }, 409);
        }
        if (!identity.authoritativeEmail) {
          return json({ error: "기존 계정 보호를 위해 먼저 이메일과 비밀번호로 로그인한 뒤 Google 계정을 연결해 주세요." }, 409);
        }
        const authProvider = emailUser.authProvider === "password" ? "password+google" : emailUser.authProvider;
        await db.prepare("UPDATE users SET google_sub = ?, auth_provider = ? WHERE id = ?")
          .bind(identity.sub, authProvider, emailUser.id)
          .run();
        row = { ...emailUser, authProvider };
      } else {
        const userId = crypto.randomUUID();
        const salt = randomToken(16);
        const unavailablePassword = randomToken(48);
        try {
          await db.prepare(
            "INSERT INTO users (id, email, display_name, password_hash, password_salt, google_sub, auth_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, 'google', ?)",
          ).bind(
            userId,
            identity.email,
            identity.name,
            await passwordHash(unavailablePassword, salt),
            salt,
            identity.sub,
            Date.now(),
          ).run();
          row = { id: userId, email: identity.email, name: identity.name, authProvider: "google" };
        } catch {
          row = await db.prepare(
            "SELECT id, email, display_name AS name, auth_provider AS authProvider FROM users WHERE google_sub = ?",
          ).bind(identity.sub).first<AuthUser>();
          if (!row) return json({ error: "Google 계정을 연결하지 못했어요. 다시 시도해 주세요." }, 409);
        }
      }
    }
    return createSession(db, row);
  }

  if (url.pathname === "/api/auth/signup" && request.method === "POST") {
    const body = await readJsonBody<{ name?: unknown; email?: unknown; password?: unknown }>(request);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (name.length < 2 || name.length > 24) return json({ error: "이름은 2~24자로 입력해 주세요." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return json({ error: "올바른 이메일을 입력해 주세요." }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "비밀번호는 8자 이상 입력해 주세요." }, 400);
    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existing) return json({ error: "이미 가입된 이메일이에요." }, 409);
    const user: AuthUser = { id: crypto.randomUUID(), email, name, authProvider: "password" };
    const salt = randomToken(16);
    const nextRecoveryCode = recoveryCode();
    const recoverySalt = randomToken(16);
    await db.prepare("INSERT INTO users (id, email, display_name, password_hash, password_salt, recovery_hash, recovery_salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(user.id, user.email, user.name, await passwordHash(password, salt), salt, await passwordHash(nextRecoveryCode, recoverySalt), recoverySalt, Date.now())
      .run();
    const response = await createSession(db, user);
    const payload = await response.json() as { user: AuthUser };
    return json({ ...payload, recoveryCode: nextRecoveryCode }, 200, { "Set-Cookie": response.headers.get("Set-Cookie") ?? "" });
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJsonBody<{ email?: unknown; password?: unknown }>(request);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const attemptKey = await authAttemptKey("login", email, request);
    const lockRemaining = await authLockRemaining(db, attemptKey);
    if (lockRemaining > 0) {
      return json({ error: "로그인 시도가 너무 많아요. 15분 뒤 다시 시도해 주세요." }, 429, { "Retry-After": String(Math.ceil(lockRemaining / 1000)) });
    }
    const row = await db.prepare("SELECT id, email, display_name AS name, auth_provider AS authProvider, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE email = ?")
      .bind(email)
      .first<AuthUser & { passwordHash: string; passwordSalt: string }>();
    const candidateHash = await passwordHash(password, row?.passwordSalt ?? "timeit-invalid-account-salt");
    if (!row || !safeEqual(candidateHash, row.passwordHash)) {
      await recordAuthFailure(db, attemptKey);
      return json({ error: "이메일 또는 비밀번호를 확인해 주세요." }, 401);
    }
    await clearAuthFailures(db, attemptKey);
    return createSession(db, { id: row.id, email: row.email, name: row.name, authProvider: row.authProvider });
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  }

  if (url.pathname === "/api/auth/reset-password" && request.method === "POST") {
    const body = await readJsonBody<{ email?: unknown; recoveryCode?: unknown; password?: unknown }>(request);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body?.recoveryCode === "string" ? body.recoveryCode.trim().toUpperCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "가입한 이메일을 확인해 주세요." }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "새 비밀번호는 8자 이상 입력해 주세요." }, 400);
    const attemptKey = await authAttemptKey("recovery", email, request);
    const lockRemaining = await authLockRemaining(db, attemptKey);
    if (lockRemaining > 0) {
      return json({ error: "복구 시도가 너무 많아요. 15분 뒤 다시 시도해 주세요." }, 429, { "Retry-After": String(Math.ceil(lockRemaining / 1000)) });
    }
    const row = await db.prepare(
      "SELECT id, recovery_hash AS recoveryHash, recovery_salt AS recoverySalt FROM users WHERE email = ?",
    ).bind(email).first<{ id: string; recoveryHash: string | null; recoverySalt: string | null }>();
    const candidateHash = await passwordHash(code, row?.recoverySalt ?? "timeit-invalid-recovery-salt");
    if (!row?.recoveryHash || !safeEqual(candidateHash, row.recoveryHash)) {
      await recordAuthFailure(db, attemptKey);
      return json({ error: "이메일 또는 복구 코드를 확인해 주세요." }, 401);
    }
    const salt = randomToken(16);
    const nextRecoveryCode = recoveryCode();
    const recoverySalt = randomToken(16);
    await db.batch([
      db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, recovery_hash = ?, recovery_salt = ? WHERE id = ?")
        .bind(await passwordHash(password, salt), salt, await passwordHash(nextRecoveryCode, recoverySalt), recoverySalt, row.id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.id),
      db.prepare("DELETE FROM auth_attempts WHERE attempt_key = ?").bind(attemptKey),
    ]);
    return json({ ok: true, recoveryCode: nextRecoveryCode }, 200, { "Set-Cookie": sessionCookie("", 0) });
  }

  if (url.pathname === "/api/account/profile" && request.method === "PATCH") {
    const user = await currentUser(request, db);
    if (!user) return json({ error: "로그인이 필요해요." }, 401);
    const body = await readJsonBody<{ name?: unknown }>(request);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 24) return json({ error: "이름은 2~24자로 입력해 주세요." }, 400);
    await db.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(name, user.id).run();
    return json({ user: { ...user, name } });
  }

  if (url.pathname === "/api/account/password" && request.method === "POST") {
    const user = await currentUser(request, db);
    if (!user) return json({ error: "로그인이 필요해요." }, 401);
    const body = await readJsonBody<{ currentPassword?: unknown; newPassword?: unknown }>(request);
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    if (newPassword.length < 8 || newPassword.length > 128) return json({ error: "새 비밀번호는 8자 이상 입력해 주세요." }, 400);
    if (!await verifiedPasswordUser(db, user.id, currentPassword)) return json({ error: "현재 비밀번호가 올바르지 않아요." }, 401);
    const salt = randomToken(16);
    await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
      .bind(await passwordHash(newPassword, salt), salt, user.id)
      .run();
    return json({ ok: true });
  }

  if (url.pathname === "/api/account/recovery-code" && request.method === "POST") {
    const user = await currentUser(request, db);
    if (!user) return json({ error: "로그인이 필요해요." }, 401);
    const body = await readJsonBody<{ currentPassword?: unknown }>(request);
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    if (!await verifiedPasswordUser(db, user.id, currentPassword)) return json({ error: "현재 비밀번호가 올바르지 않아요." }, 401);
    const nextRecoveryCode = recoveryCode();
    const salt = randomToken(16);
    await db.prepare("UPDATE users SET recovery_hash = ?, recovery_salt = ? WHERE id = ?")
      .bind(await passwordHash(nextRecoveryCode, salt), salt, user.id)
      .run();
    return json({ recoveryCode: nextRecoveryCode });
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
