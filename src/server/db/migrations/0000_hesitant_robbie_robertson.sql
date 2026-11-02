CREATE TABLE `agenda` (
	`dataset` text NOT NULL,
	`id` text NOT NULL,
	`candidateId` text,
	`revision` text NOT NULL,
	`payload` text NOT NULL,
	`editedFields` text NOT NULL,
	PRIMARY KEY(`dataset`, `id`),
	FOREIGN KEY (`dataset`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `briefs` (
	`dataset` text NOT NULL,
	`sourceKey` text NOT NULL,
	`items` text NOT NULL,
	PRIMARY KEY(`dataset`, `sourceKey`),
	FOREIGN KEY (`dataset`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `candidates` (
	`dataset` text NOT NULL,
	`id` text NOT NULL,
	`revision` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`dataset`, `id`),
	FOREIGN KEY (`dataset`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`scenario` text DEFAULT 'normal' NOT NULL,
	`initialized` integer DEFAULT false NOT NULL,
	`lastSuccess` text,
	`briefAt` text,
	`nextRefresh` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`dataset` text NOT NULL,
	`candidateId` text NOT NULL,
	`revision` text NOT NULL,
	`decision` text NOT NULL,
	`candidate` text NOT NULL,
	`details` text,
	`decidedAt` text NOT NULL,
	PRIMARY KEY(`dataset`, `candidateId`, `revision`),
	FOREIGN KEY (`dataset`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`createdAt` integer NOT NULL,
	`error` text,
	FOREIGN KEY (`dataset`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`dataset` text NOT NULL,
	`key` text NOT NULL,
	`revision` text NOT NULL,
	`record` text NOT NULL,
	`extraction` text,
	PRIMARY KEY(`dataset`, `key`),
	FOREIGN KEY (`dataset`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset` text NOT NULL,
	`startedAt` text NOT NULL,
	`finishedAt` text,
	`coverage` text NOT NULL,
	`error` text,
	FOREIGN KEY (`dataset`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `worker_lease` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expiresAt` integer NOT NULL
);
