import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  recoveryHash: text("recovery_hash"),
  recoverySalt: text("recovery_salt"),
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
