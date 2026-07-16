CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repo_url` text NOT NULL,
	`default_branch` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`received_at` text NOT NULL,
	`envelope` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_issue_id` ON `events` (`issue_id`);--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_issues_app_id` ON `issues` (`app_id`);--> statement-breakpoint
CREATE INDEX `idx_issues_status` ON `issues` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_issues_app_fingerprint` ON `issues` (`app_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `patches` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`branch` text NOT NULL,
	`file_path` text NOT NULL,
	`attached_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `performance_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`unit` text DEFAULT 'millisecond' NOT NULL,
	`measured_at` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_performance_samples_app_time` ON `performance_samples` (`app_id`,`measured_at`);--> statement-breakpoint
CREATE TABLE `rrweb_replays` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`issue_id` text,
	`sentry_event_id` text,
	`received_at` text NOT NULL,
	`captured_at` text,
	`start_at` integer,
	`end_at` integer,
	`event_count` integer DEFAULT 0 NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`payload` text DEFAULT '[]' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rrweb_replays_issue_id` ON `rrweb_replays` (`issue_id`);--> statement-breakpoint
CREATE INDEX `idx_rrweb_replays_app_id` ON `rrweb_replays` (`app_id`);--> statement-breakpoint
CREATE INDEX `idx_rrweb_replays_sentry_event_id` ON `rrweb_replays` (`sentry_event_id`);--> statement-breakpoint
CREATE TABLE `source_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`release` text DEFAULT '' NOT NULL,
	`file` text NOT NULL,
	`source_map` text NOT NULL,
	`uploaded_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_maps_lookup` ON `source_maps` (`app_id`,`release`,`file`);