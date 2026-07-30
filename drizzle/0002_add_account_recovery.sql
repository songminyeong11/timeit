ALTER TABLE `users` ADD COLUMN `recovery_hash` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `recovery_salt` text;
