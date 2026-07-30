CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `study_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_members_group_id_idx` ON `group_members` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_members_user_id_idx` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `group_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `study_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_posts_group_id_idx` ON `group_posts` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_posts_created_at_idx` ON `group_posts` (`created_at`);--> statement-breakpoint
CREATE TABLE `group_presence` (
	`user_id` text PRIMARY KEY NOT NULL,
	`subject_name` text,
	`active` integer DEFAULT false NOT NULL,
	`elapsed_seconds` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `study_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`target_grade` text,
	`visibility` text DEFAULT 'public' NOT NULL,
	`join_code` text NOT NULL,
	`daily_target_minutes` integer DEFAULT 240 NOT NULL,
	`max_members` integer DEFAULT 20 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_groups_join_code_unique` ON `study_groups` (`join_code`);--> statement-breakpoint
CREATE INDEX `study_groups_owner_id_idx` ON `study_groups` (`owner_id`);--> statement-breakpoint
CREATE INDEX `study_groups_target_grade_idx` ON `study_groups` (`target_grade`);--> statement-breakpoint
ALTER TABLE `users` ADD `birth_date` text;