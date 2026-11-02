import { z } from "zod";

export const DEMO_DATE = "2026-11-02";
export const WINDOW_END = "2026-12-02";
export const TIME_ZONE = "Europe/Copenhagen";
export const REFRESH_INTERVAL = 30 * 60 * 1000;
export const LIVE_RETENTION_MS = 90 * 86400_000;
export const children = {
  emma: { name: "Emma", institution: "Lindely School · 2B", initial: "E" },
  alex: { name: "Alex", institution: "Birch Kindergarten", initial: "A" },
} as const;
export const sourceKinds = ["Message", "Post", "Calendar"] as const;
export const liveSourceKinds = [...sourceKinds, "Weekly plan"] as const;
export const lessonLinkSchema = z.object({
  label: z.string().min(1).max(500),
  url: z.url().max(2000).refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
      !/(^|[.\-])(localhost|local|internal)$/.test(url.hostname) &&
      !/^(?:\d{1,3}\.){3}\d{1,3}$|^\[/.test(url.hostname) &&
      !/(?:token|session|login|auth|redirect|password|secret|jwt)/i.test(url.pathname) &&
      !/(?:token|session|login|auth|password|secret|jwt)/i.test(url.hash) &&
      ![...url.searchParams.keys()].some((key) => /token|session|login|auth|password|secret|code|key|sig/i.test(key));
  }),
});
export const scenarioSchema = z.enum(["normal", "busy", "empty", "loading", "partial", "stale", "error", "disconnected", "reconnect", "ai-unavailable"]);
export type Scenario = z.infer<typeof scenarioSchema>;
export const scenarios: Record<Scenario, { label: string }> = {
  normal: { label: "Normal day" }, busy: { label: "Busy day" }, empty: { label: "Empty response" },
  loading: { label: "Slow refresh" }, partial: { label: "Partial results" }, stale: { label: "Stale data" },
  error: { label: "Refresh error" }, disconnected: { label: "Disconnected" },
  reconnect: { label: "Reconnect required" }, "ai-unavailable": { label: "Summary unavailable" },
};
export const childSchema = z.string().regex(/^(emma|alex|household|aula-\d+)$/);
export type ChildId = z.infer<typeof childSchema>;
export type ChildFilter = ChildId | "all";
export const sourceSchema = z.object({
  id: z.string().min(1), kind: z.enum(liveSourceKinds), title: z.string().min(1),
  author: z.string().min(1), timestamp: z.iso.datetime({ offset: true }),
  excerpt: z.string().min(1), attachment: z.string().optional(),
  notice: z.string().optional(), timestampLabel: z.enum(["Published", "Latest message", "Event time"]).optional(),
  links: z.array(lessonLinkSchema).max(100).optional(),
  messages: z.array(z.object({
    id: z.string().min(1), timestamp: z.iso.datetime({ offset: true }),
    author: z.string().min(1).max(500), excerpt: z.string().max(100_000),
  })).max(1000).optional(),
});
export type Source = z.infer<typeof sourceSchema>;
export type SourceKind = Source["kind"];
export const eventDetailsSchema = z.object({
  title: z.string().trim().min(1).max(300),
  date: z.iso.date(),
  time: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
  location: z.string().trim().max(500),
});
export type EventDetails = z.infer<typeof eventDetailsSchema>;
export const suggestionSchema = eventDetailsSchema.extend({
  id: z.string().min(1), date: z.iso.date().nullable(), child: childSchema,
  source: sourceSchema, summary: z.string().min(1), uncertainty: z.string().optional(),
  replacesId: z.string().optional(), busyOnly: z.boolean().optional(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;
export const candidateSchema = suggestionSchema.extend({
  revision: z.string().min(1), sourceKey: z.string().min(1), editedFields: z.array(z.enum(["title", "date", "time", "location"])),
});
export type Candidate = z.infer<typeof candidateSchema>;
export const agendaSchema = eventDetailsSchema.extend({
  id: z.string().min(1), child: childSchema, source: sourceSchema,
  origin: z.enum(["Structured calendar", "Approved suggestion"]),
  endDate: z.iso.date().optional(), endTime: z.string().optional(), allDay: z.boolean().optional(),
  notes: z.string().max(100_000).optional(), className: z.string().max(500).optional(),
});
export type AgendaEntry = z.infer<typeof agendaSchema>;
export const briefItemSchema = z.object({
  id: z.string().min(1), child: childSchema, title: z.string().min(1),
  summary: z.string().min(1), source: sourceSchema, label: z.string(),
  busyOnly: z.boolean().optional(),
});
export type BriefItem = z.infer<typeof briefItemSchema>;
export const sourceRecordSchema = z.object({
  upstreamId: z.string().min(1), accountScope: z.string().min(1),
  child: childSchema, source: sourceSchema,
  structuredEvent: agendaSchema.optional(),
  schoolWeek: z.object({ start: z.iso.date(), entries: z.array(agendaSchema).max(1000) }).optional(),
  retainUntil: z.iso.datetime({ offset: true }).optional(),
});
export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export const extractionSchema = z.object({
  candidates: z.array(suggestionSchema), brief: z.array(briefItemSchema),
});
export type Extraction = z.infer<typeof extractionSchema>;
export const errorCodeSchema = z.enum(["unavailable", "timeout", "incomplete", "disconnected", "reconnect", "invalid-data", "summary-unavailable", "interrupted", "rate-limited"]);
export type SyncErrorCode = z.infer<typeof errorCodeSchema>;
export const coverageSchema = z.object({
  kind: z.enum(liveSourceKinds), pages: z.number(), items: z.number(), complete: z.boolean(),
  error: errorCodeSchema.nullable(), checkedAt: z.string().nullable(), lastSuccess: z.string().nullable(),
  exclusions: z.array(z.string()).optional(),
});
export type Coverage = z.infer<typeof coverageSchema>;
export const householdSchema = z.record(z.string(), z.object({
  name: z.string().min(1), institution: z.string(), initial: z.string().min(1),
}));
export type Household = z.infer<typeof householdSchema>;
export const previewSchema = z.object({ id: z.string(), child: childSchema, source: sourceSchema });
export const snapshotSchema = z.object({
  mode: z.enum(["synthetic", "live"]), household: householdSchema,
  today: z.iso.date(), windowEnd: z.iso.date(), previews: z.array(previewSchema),
  paused: z.boolean(), connected: z.boolean(),
  dataset: z.string(), scenario: scenarioSchema, agenda: z.array(agendaSchema),
  schoolPlan: z.array(agendaSchema).default([]),
  suggestions: z.array(candidateSchema), brief: z.array(briefItemSchema),
  decisions: z.record(z.string(), z.enum(["approved", "dismissed"])),
  lastSuccess: z.string().nullable(), briefAt: z.string().nullable(),
  coverage: z.array(coverageSchema), syncError: z.string().nullable(),
  job: z.enum(["queued", "running"]).nullable(), workerOnline: z.boolean(), stale: z.boolean(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const mutationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("approve"), id: z.string(), revision: z.string(), details: eventDetailsSchema, dateConfirmed: z.boolean().default(false) }),
  z.object({ type: z.literal("dismiss"), id: z.string(), revision: z.string() }),
  z.object({ type: z.literal("refresh") }),
  z.object({ type: z.literal("scenario"), scenario: scenarioSchema }),
  z.object({ type: z.literal("reset") }),
  z.object({ type: z.literal("delete-live") }),
  z.object({ type: z.literal("disconnect") }),
]);
export type Mutation = z.infer<typeof mutationSchema>;

export class DomainError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
