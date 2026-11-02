import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AgendaEntry, BriefItem, Candidate, Coverage, EventDetails, Scenario, SourceRecord, Extraction, Household } from "../../domain/model";

export const datasets = sqliteTable("datasets", {
  id: text().primaryKey(), kind: text({ enum: ["synthetic", "live"] }).notNull(),
  scenario: text().$type<Scenario>().notNull().default("normal"),
  generation: text().notNull().default("initial"),
  initialized: integer({ mode: "boolean" }).notNull().default(false),
  lastSuccess: text(), briefAt: text(), nextRefresh: integer().notNull().default(0),
  accountScope: text(), household: text({ mode: "json" }).$type<Household>(),
  householdAt: integer(), paused: integer({ mode: "boolean" }).notNull().default(false),
});
export const sources = sqliteTable("sources", {
  dataset: text().notNull().references(() => datasets.id, { onDelete: "cascade" }),
  key: text().notNull(), revision: text().notNull(),
  record: text({ mode: "json" }).$type<SourceRecord>().notNull(),
  extraction: text({ mode: "json" }).$type<Extraction>(),
  firstSeenAt: integer().notNull().default(0), expiresAt: integer(),
}, (t) => [primaryKey({ columns: [t.dataset, t.key] })]);
export const candidates = sqliteTable("candidates", {
  dataset: text().notNull().references(() => datasets.id, { onDelete: "cascade" }),
  id: text().notNull(), revision: text().notNull(),
  payload: text({ mode: "json" }).$type<Candidate>().notNull(),
}, (t) => [primaryKey({ columns: [t.dataset, t.id] })]);
export const decisions = sqliteTable("decisions", {
  dataset: text().notNull().references(() => datasets.id, { onDelete: "cascade" }),
  candidateId: text().notNull(), revision: text().notNull(),
  decision: text({ enum: ["approved", "dismissed"] }).notNull(),
  candidate: text({ mode: "json" }).$type<Candidate>().notNull(),
  details: text({ mode: "json" }).$type<EventDetails>(), decidedAt: text().notNull(),
}, (t) => [primaryKey({ columns: [t.dataset, t.candidateId, t.revision] })]);
export const agenda = sqliteTable("agenda", {
  dataset: text().notNull().references(() => datasets.id, { onDelete: "cascade" }),
  id: text().notNull(), candidateId: text(), revision: text().notNull(),
  payload: text({ mode: "json" }).$type<AgendaEntry>().notNull(),
  editedFields: text({ mode: "json" }).$type<(keyof EventDetails)[]>().notNull(),
  sourceKey: text(),
}, (t) => [primaryKey({ columns: [t.dataset, t.id] })]);
export const briefs = sqliteTable("briefs", {
  dataset: text().notNull().references(() => datasets.id, { onDelete: "cascade" }),
  sourceKey: text().notNull(), items: text({ mode: "json" }).$type<BriefItem[]>().notNull(),
}, (t) => [primaryKey({ columns: [t.dataset, t.sourceKey] })]);
export const syncRuns = sqliteTable("sync_runs", {
  id: text().primaryKey(), dataset: text().notNull().references(() => datasets.id, { onDelete: "cascade" }),
  startedAt: text().notNull(), finishedAt: text(),
  coverage: text({ mode: "json" }).$type<Coverage[]>().notNull(), error: text(),
});
export const jobs = sqliteTable("jobs", {
  id: text().primaryKey(), dataset: text().notNull().references(() => datasets.id, { onDelete: "cascade" }),
  type: text({ enum: ["refresh", "reset", "delete-live", "disconnect"] }).notNull(),
  status: text({ enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
  createdAt: integer().notNull(), error: text(),
});
export const workerLease = sqliteTable("worker_lease", {
  id: integer().primaryKey(), owner: text().notNull(), expiresAt: integer().notNull(),
});
