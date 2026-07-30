import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  recoveryHash: text("recovery_hash"),
  recoverySalt: text("recovery_salt"),
  googleSub: text("google_sub").unique(),
  authProvider: text("auth_provider").notNull().default("password"),
  birthDate: text("birth_date"),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expires_at_idx").on(table.expiresAt),
]);

export const userData = sqliteTable("user_data", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const authAttempts = sqliteTable("auth_attempts", {
  attemptKey: text("attempt_key").primaryKey(),
  failures: integer("failures").notNull(),
  windowStartedAt: integer("window_started_at").notNull(),
  lockedUntil: integer("locked_until").notNull().default(0),
}, (table) => [
  index("auth_attempts_locked_until_idx").on(table.lockedUntil),
]);

export const studyGroups = sqliteTable("study_groups", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  targetGrade: text("target_grade"),
  visibility: text("visibility").notNull().default("public"),
  joinCode: text("join_code").notNull().unique(),
  dailyTargetMinutes: integer("daily_target_minutes").notNull().default(240),
  maxMembers: integer("max_members").notNull().default(20),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("study_groups_owner_id_idx").on(table.ownerId),
  index("study_groups_target_grade_idx").on(table.targetGrade),
]);

export const groupMembers = sqliteTable("group_members", {
  groupId: text("group_id").notNull().references(() => studyGroups.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  joinedAt: integer("joined_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.groupId, table.userId] }),
  index("group_members_group_id_idx").on(table.groupId),
  index("group_members_user_id_idx").on(table.userId),
]);

export const groupPresence = sqliteTable("group_presence", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  subjectName: text("subject_name"),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const groupPosts = sqliteTable("group_posts", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => studyGroups.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("group_posts_group_id_idx").on(table.groupId),
  index("group_posts_created_at_idx").on(table.createdAt),
]);
