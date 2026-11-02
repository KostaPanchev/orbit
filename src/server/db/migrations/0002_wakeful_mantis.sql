ALTER TABLE `agenda` ADD `sourceKey` text;--> statement-breakpoint
ALTER TABLE `datasets` ADD `accountScope` text;--> statement-breakpoint
ALTER TABLE `datasets` ADD `household` text;--> statement-breakpoint
ALTER TABLE `datasets` ADD `householdAt` integer;--> statement-breakpoint
ALTER TABLE `datasets` ADD `paused` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `firstSeenAt` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `expiresAt` integer;