import { createRemoteJWKSet, jwtVerify } from "jose";

export type AuthEnv = {
  DB?: D1Database;
};

type AuthUser = {
  id: string;
  email: string;
  name: string;
  authProvider: "password" | "google" | "password+google";
  birthDate: string | null;
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

function validBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  const minimum = new Date("1940-01-01T00:00:00Z");
  const maximum = new Date();
  maximum.setUTCFullYear(maximum.getUTCFullYear() - 7);
  return Number.isFinite(parsed.getTime()) && parsed >= minimum && parsed <= maximum && parsed.toISOString().slice(0, 10) === value;
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
  if (!columnNames.has("birth_date")) await db.prepare("ALTER TABLE users ADD COLUMN birth_date TEXT").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub)").run();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS study_groups (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, target_grade TEXT, visibility TEXT NOT NULL DEFAULT 'public', join_code TEXT NOT NULL UNIQUE, daily_target_minutes INTEGER NOT NULL DEFAULT 240, max_members INTEGER NOT NULL DEFAULT 20, created_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'member', joined_at INTEGER NOT NULL, PRIMARY KEY(group_id, user_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS group_presence (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, subject_name TEXT, active INTEGER NOT NULL DEFAULT 0, elapsed_seconds INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS group_posts (id TEXT PRIMARY KEY NOT NULL, group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS study_groups_owner_id_idx ON study_groups(owner_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS study_groups_target_grade_idx ON study_groups(target_grade)"),
    db.prepare("CREATE INDEX IF NOT EXISTS group_members_group_id_idx ON group_members(group_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS group_members_user_id_idx ON group_members(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS group_posts_group_id_idx ON group_posts(group_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS group_posts_created_at_idx ON group_posts(created_at)"),
  ]);
}

async function currentUser(request: Request, db: D1Database): Promise<AuthUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await db.prepare(
    "SELECT users.id, users.email, users.display_name AS name, users.auth_provider AS authProvider, users.birth_date AS birthDate FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
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
    "SELECT id, email, display_name AS name, auth_provider AS authProvider, birth_date AS birthDate, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE id = ?",
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

function gradeFromBirthDate(birthDate: string | null) {
  if (!birthDate) return null;
  const birthYear = Number(birthDate.slice(0, 4));
  const now = new Date();
  const academicYear = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const gradeIndex = academicYear - birthYear - 6;
  if (gradeIndex >= 1 && gradeIndex <= 6) return `초${gradeIndex}`;
  if (gradeIndex >= 7 && gradeIndex <= 9) return `중${gradeIndex - 6}`;
  if (gradeIndex >= 10 && gradeIndex <= 12) return `고${gradeIndex - 9}`;
  return "대학생·일반";
}

function todayKeyInKorea(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function measuredTodaySeconds(payload: string | null) {
  if (!payload) return 0;
  try {
    const parsed = JSON.parse(payload) as { studyLogs?: Array<{ recordedAt?: string; trackedSeconds?: number }> };
    return (parsed.studyLogs ?? []).reduce((total, log) => {
      if (!log.recordedAt || !Number.isFinite(log.trackedSeconds)) return total;
      const recorded = new Date(log.recordedAt);
      if (!Number.isFinite(recorded.getTime()) || todayKeyInKorea(recorded) !== todayKeyInKorea()) return total;
      return total + Math.max(0, Math.round(log.trackedSeconds ?? 0));
    }, 0);
  } catch {
    return 0;
  }
}

function groupJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(random, (value) => alphabet[value % alphabet.length]).join("");
}

async function groupMember(db: D1Database, groupId: string, userId: string) {
  return db.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?")
    .bind(groupId, userId)
    .first<{ role: "owner" | "member" }>();
}

async function groupSummaryRows(db: D1Database, user: AuthUser) {
  const myGroups = await db.prepare(
    `SELECT g.id, g.name, g.description, g.category, g.target_grade AS targetGrade,
            g.visibility, g.join_code AS joinCode, g.daily_target_minutes AS dailyTargetMinutes,
            g.max_members AS maxMembers, gm.role,
            (SELECT COUNT(*) FROM group_members members WHERE members.group_id = g.id) AS memberCount
       FROM study_groups g
       JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ?
      ORDER BY gm.joined_at DESC`,
  ).bind(user.id).all<Record<string, unknown>>();
  const grade = gradeFromBirthDate(user.birthDate);
  const recommended = await db.prepare(
    `SELECT g.id, g.name, g.description, g.category, g.target_grade AS targetGrade,
            g.visibility, g.daily_target_minutes AS dailyTargetMinutes, g.max_members AS maxMembers,
            (SELECT COUNT(*) FROM group_members members WHERE members.group_id = g.id) AS memberCount
       FROM study_groups g
      WHERE g.visibility = 'public'
        AND NOT EXISTS (SELECT 1 FROM group_members mine WHERE mine.group_id = g.id AND mine.user_id = ?)
        AND (? IS NULL OR g.target_grade IS NULL OR g.target_grade = ?)
      ORDER BY CASE WHEN g.target_grade = ? THEN 0 ELSE 1 END, memberCount DESC, g.created_at DESC
      LIMIT 20`,
  ).bind(user.id, grade, grade, grade).all<Record<string, unknown>>();
  return { myGroups: myGroups.results ?? [], recommended: recommended.results ?? [], grade };
}

async function handleGroupRequest(request: Request, db: D1Database) {
  const url = new URL(request.url);
  const user = await currentUser(request, db);
  if (!user) return json({ error: "그룹을 이용하려면 로그인이 필요해요." }, 401);

  if (url.pathname === "/api/groups" && request.method === "GET") {
    return json(await groupSummaryRows(db, user));
  }

  if (url.pathname === "/api/groups" && request.method === "POST") {
    const body = await readJsonBody<{
      name?: unknown;
      description?: unknown;
      category?: unknown;
      targetGrade?: unknown;
      visibility?: unknown;
      dailyTargetMinutes?: unknown;
      maxMembers?: unknown;
    }>(request);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const category = typeof body?.category === "string" ? body.category.trim() : "";
    const targetGrade = typeof body?.targetGrade === "string" ? body.targetGrade.trim() : "";
    const visibility = body?.visibility === "private" ? "private" : "public";
    const dailyTargetMinutes = Number(body?.dailyTargetMinutes);
    const maxMembers = Number(body?.maxMembers);
    if (name.length < 2 || name.length > 24) return json({ error: "그룹 이름은 2~24자로 입력해 주세요." }, 400);
    if (description.length < 2 || description.length > 80) return json({ error: "그룹 소개는 2~80자로 입력해 주세요." }, 400);
    if (!["내신", "수능", "자격증", "공무원", "어학", "기타"].includes(category)) return json({ error: "그룹 분야를 선택해 주세요." }, 400);
    if (!Number.isInteger(dailyTargetMinutes) || dailyTargetMinutes < 30 || dailyTargetMinutes > 960) return json({ error: "하루 기준 시간은 30분~16시간으로 설정해 주세요." }, 400);
    if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 50) return json({ error: "그룹 정원은 2~50명으로 설정해 주세요." }, 400);
    const owned = await db.prepare("SELECT COUNT(*) AS count FROM study_groups WHERE owner_id = ?").bind(user.id).first<{ count: number }>();
    if ((owned?.count ?? 0) >= 5) return json({ error: "직접 운영할 수 있는 그룹은 최대 5개예요." }, 409);
    const groupId = crypto.randomUUID();
    let joinCode = groupJoinCode();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const exists = await db.prepare("SELECT id FROM study_groups WHERE join_code = ?").bind(joinCode).first();
      if (!exists) break;
      joinCode = groupJoinCode();
    }
    const now = Date.now();
    await db.batch([
      db.prepare("INSERT INTO study_groups (id, owner_id, name, description, category, target_grade, visibility, join_code, daily_target_minutes, max_members, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(groupId, user.id, name, description, category, targetGrade || null, visibility, joinCode, dailyTargetMinutes, maxMembers, now),
      db.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)")
        .bind(groupId, user.id, now),
    ]);
    return json({ ok: true, groupId, joinCode }, 201);
  }

  if (url.pathname === "/api/groups/join" && request.method === "POST") {
    const body = await readJsonBody<{ groupId?: unknown; joinCode?: unknown }>(request);
    const groupIdInput = typeof body?.groupId === "string" ? body.groupId : "";
    const joinCode = typeof body?.joinCode === "string" ? body.joinCode.trim().toUpperCase() : "";
    const group = groupIdInput
      ? await db.prepare("SELECT id, visibility, max_members AS maxMembers FROM study_groups WHERE id = ?").bind(groupIdInput).first<{ id: string; visibility: string; maxMembers: number }>()
      : await db.prepare("SELECT id, visibility, max_members AS maxMembers FROM study_groups WHERE join_code = ?").bind(joinCode).first<{ id: string; visibility: string; maxMembers: number }>();
    if (!group) return json({ error: "그룹을 찾지 못했어요. 초대 코드를 확인해 주세요." }, 404);
    if (group.visibility === "private" && !joinCode) return json({ error: "비공개 그룹은 초대 코드가 필요해요." }, 403);
    const count = await db.prepare("SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?").bind(group.id).first<{ count: number }>();
    if ((count?.count ?? 0) >= group.maxMembers) return json({ error: "그룹 정원이 모두 찼어요." }, 409);
    await db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
      .bind(group.id, user.id, Date.now())
      .run();
    return json({ ok: true, groupId: group.id });
  }

  if (url.pathname === "/api/groups/presence" && request.method === "POST") {
    const body = await readJsonBody<{ active?: unknown; subjectName?: unknown; elapsedSeconds?: unknown }>(request);
    const active = body?.active === true;
    const subjectName = typeof body?.subjectName === "string" ? body.subjectName.trim().slice(0, 24) : "";
    const elapsedSeconds = Math.max(0, Math.min(86_400, Math.round(Number(body?.elapsedSeconds) || 0)));
    await db.prepare(
      "INSERT INTO group_presence (user_id, subject_name, active, elapsed_seconds, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET subject_name = excluded.subject_name, active = excluded.active, elapsed_seconds = excluded.elapsed_seconds, updated_at = excluded.updated_at",
    ).bind(user.id, subjectName || null, active ? 1 : 0, elapsedSeconds, Date.now()).run();
    return json({ ok: true });
  }

  const groupMatch = url.pathname.match(/^\/api\/groups\/([^/]+)(?:\/(posts))?$/);
  if (!groupMatch) return json({ error: "지원하지 않는 그룹 요청이에요." }, 404);
  const groupId = groupMatch[1];
  const subresource = groupMatch[2];
  const membership = await groupMember(db, groupId, user.id);
  if (!membership) return json({ error: "가입한 그룹만 볼 수 있어요." }, 403);

  if (!subresource && request.method === "GET") {
    const group = await db.prepare(
      `SELECT id, owner_id AS ownerId, name, description, category, target_grade AS targetGrade,
              visibility, join_code AS joinCode, daily_target_minutes AS dailyTargetMinutes,
              max_members AS maxMembers, created_at AS createdAt
         FROM study_groups WHERE id = ?`,
    ).bind(groupId).first<Record<string, unknown>>();
    if (!group) return json({ error: "그룹을 찾지 못했어요." }, 404);
    const memberRows = await db.prepare(
      `SELECT u.id, u.display_name AS name, u.birth_date AS birthDate, gm.role, gm.joined_at AS joinedAt,
              ud.payload, gp.subject_name AS subjectName, gp.active, gp.elapsed_seconds AS elapsedSeconds,
              gp.updated_at AS presenceUpdatedAt
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         LEFT JOIN user_data ud ON ud.user_id = u.id
         LEFT JOIN group_presence gp ON gp.user_id = u.id
        WHERE gm.group_id = ?`,
    ).bind(groupId).all<{
      id: string;
      name: string;
      birthDate: string | null;
      role: string;
      joinedAt: number;
      payload: string | null;
      subjectName: string | null;
      active: number | null;
      elapsedSeconds: number | null;
      presenceUpdatedAt: number | null;
    }>();
    const now = Date.now();
    const members = (memberRows.results ?? []).map((member) => ({
      id: member.id,
      name: member.name,
      grade: gradeFromBirthDate(member.birthDate),
      role: member.role,
      todaySeconds: measuredTodaySeconds(member.payload),
      isStudying: member.active === 1 && now - (member.presenceUpdatedAt ?? 0) < 90_000,
      subjectName: member.subjectName,
      elapsedSeconds: member.elapsedSeconds ?? 0,
      isMe: member.id === user.id,
    })).sort((left, right) => right.todaySeconds - left.todaySeconds);
    const posts = await db.prepare(
      `SELECT p.id, p.body, p.created_at AS createdAt, u.id AS authorId, u.display_name AS authorName
         FROM group_posts p JOIN users u ON u.id = p.user_id
        WHERE p.group_id = ? ORDER BY p.created_at DESC LIMIT 30`,
    ).bind(groupId).all<Record<string, unknown>>();
    return json({ group: { ...group, role: membership.role }, members, posts: posts.results ?? [] });
  }

  if (!subresource && request.method === "DELETE") {
    if (membership.role === "owner") {
      await db.prepare("DELETE FROM study_groups WHERE id = ? AND owner_id = ?").bind(groupId, user.id).run();
    } else {
      await db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").bind(groupId, user.id).run();
    }
    return json({ ok: true });
  }

  if (subresource === "posts" && request.method === "POST") {
    const body = await readJsonBody<{ body?: unknown }>(request);
    const postBody = typeof body?.body === "string" ? body.body.trim() : "";
    if (postBody.length < 1 || postBody.length > 240) return json({ error: "메시지는 1~240자로 입력해 주세요." }, 400);
    await db.prepare("INSERT INTO group_posts (id, group_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), groupId, user.id, postBody, Date.now())
      .run();
    return json({ ok: true }, 201);
  }

  return json({ error: "지원하지 않는 그룹 요청이에요." }, 404);
}

export async function handleAuthRequest(request: Request, env: AuthEnv) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/") && !url.pathname.startsWith("/api/account/") && !url.pathname.startsWith("/api/groups") && url.pathname !== "/api/user-data") return null;
  if (!env.DB) return json({ error: "로그인 저장소가 아직 연결되지 않았어요." }, 503);
  if (request.method !== "GET" && !validOrigin(request)) return json({ error: "허용되지 않은 요청이에요." }, 403);

  const db = env.DB;
  await ensureSchema(db);

  if (url.pathname.startsWith("/api/groups")) return handleGroupRequest(request, db);

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    return json({ user: await currentUser(request, db) });
  }

  if (url.pathname === "/api/auth/google" && request.method === "POST") {
    const body = await readJsonBody<{ credential?: unknown }>(request);
    const credential = typeof body?.credential === "string" ? body.credential : "";
    const identity = await verifiedGoogleIdentity(credential);
    if (!identity) return json({ error: "Google 로그인을 확인하지 못했어요. 다시 시도해 주세요." }, 401);

    let row = await db.prepare(
      "SELECT id, email, display_name AS name, auth_provider AS authProvider, birth_date AS birthDate FROM users WHERE google_sub = ?",
    ).bind(identity.sub).first<AuthUser>();

    if (!row) {
      const emailUser = await db.prepare(
        "SELECT id, email, display_name AS name, auth_provider AS authProvider, birth_date AS birthDate, google_sub AS googleSub FROM users WHERE email = ?",
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
          row = { id: userId, email: identity.email, name: identity.name, authProvider: "google", birthDate: null };
        } catch {
          row = await db.prepare(
            "SELECT id, email, display_name AS name, auth_provider AS authProvider, birth_date AS birthDate FROM users WHERE google_sub = ?",
          ).bind(identity.sub).first<AuthUser>();
          if (!row) return json({ error: "Google 계정을 연결하지 못했어요. 다시 시도해 주세요." }, 409);
        }
      }
    }
    return createSession(db, row);
  }

  if (url.pathname === "/api/auth/signup" && request.method === "POST") {
    const body = await readJsonBody<{ name?: unknown; email?: unknown; password?: unknown; birthDate?: unknown }>(request);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const birthDate = typeof body?.birthDate === "string" ? body.birthDate : "";
    if (name.length < 2 || name.length > 24) return json({ error: "이름은 2~24자로 입력해 주세요." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return json({ error: "올바른 이메일을 입력해 주세요." }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "비밀번호는 8자 이상 입력해 주세요." }, 400);
    if (!validBirthDate(birthDate)) return json({ error: "생년월일을 정확히 입력해 주세요." }, 400);
    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existing) return json({ error: "이미 가입된 이메일이에요." }, 409);
    const user: AuthUser = { id: crypto.randomUUID(), email, name, authProvider: "password", birthDate };
    const salt = randomToken(16);
    const nextRecoveryCode = recoveryCode();
    const recoverySalt = randomToken(16);
    await db.prepare("INSERT INTO users (id, email, display_name, password_hash, password_salt, recovery_hash, recovery_salt, birth_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(user.id, user.email, user.name, await passwordHash(password, salt), salt, await passwordHash(nextRecoveryCode, recoverySalt), recoverySalt, birthDate, Date.now())
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
    const row = await db.prepare("SELECT id, email, display_name AS name, auth_provider AS authProvider, birth_date AS birthDate, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE email = ?")
      .bind(email)
      .first<AuthUser & { passwordHash: string; passwordSalt: string }>();
    const candidateHash = await passwordHash(password, row?.passwordSalt ?? "timeit-invalid-account-salt");
    if (!row || !safeEqual(candidateHash, row.passwordHash)) {
      await recordAuthFailure(db, attemptKey);
      return json({ error: "이메일 또는 비밀번호를 확인해 주세요." }, 401);
    }
    await clearAuthFailures(db, attemptKey);
    return createSession(db, { id: row.id, email: row.email, name: row.name, authProvider: row.authProvider, birthDate: row.birthDate });
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
    const body = await readJsonBody<{ name?: unknown; birthDate?: unknown }>(request);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const birthDate = typeof body?.birthDate === "string" ? body.birthDate : "";
    if (name.length < 2 || name.length > 24) return json({ error: "이름은 2~24자로 입력해 주세요." }, 400);
    if (!validBirthDate(birthDate)) return json({ error: "생년월일을 정확히 입력해 주세요." }, 400);
    await db.prepare("UPDATE users SET display_name = ?, birth_date = ? WHERE id = ?").bind(name, birthDate, user.id).run();
    return json({ user: { ...user, name, birthDate } });
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
