CREATE TABLE `auth_attempts` (
	`attempt_key` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`window_started_at` integer NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_attempts_locked_until_idx` ON `auth_attempts` (`locked_until`);
