import { normalizeEvent, normalizePost, normalizeProfile, normalizeThread, threadSchema } from "../src/server/aula/normalize";
import { LIVE_RETENTION_MS, type Snapshot } from "../src/domain/model";
import { liveWindow } from "../src/domain/dates";

export const LIVE_NOW = Date.parse("2026-11-02T10:00:00Z");
export const fictionalProfiles = {
  profiles: [{ profileId: 9000, children: [
    { id: 10, name: "Fictional pupil", institutionProfile: { institutionName: "Fictional school" } },
    { id: 20, name: "Fictional preschooler", institutionProfile: { institutionName: "Fictional kindergarten" } },
  ] }],
};
export const liveProfile = normalizeProfile(fictionalProfiles);
export const fictionalPost = {
  id: 100, title: "Fictional school notice", date: "2026-11-01T10:00:00Z",
  author: "Fictional teacher", content: "Husk regntøj til den fiktive tur.",
  attachments: [{ name: "fictional.pdf", url: "https://example.invalid/?token=FICTIONAL_SECRET" }],
};
export const fictionalEvent = {
  id: 300, title: "Fictional calendar visit", startDateTime: "2026-11-03T08:00:00+01:00",
  endDateTime: "2026-11-03T09:00:00+01:00", allDay: false,
  belongsToProfiles: [10], primaryResource: { name: "Fictional hall" },
};
export const fictionalThread = threadSchema.parse({
  id: 200, subject: "Fictional message thread", read: true, sensitive: false,
  latestMessage: { sendDateTime: "2026-11-01T11:00:00Z" },
});
export const fictionalMessage = {
  id: "fixture-message-1", sendDateTime: "2026-11-01T11:00:00Z",
  text: { plain: "Dette er en fiktiv besked. Ingen virkelige familiedata." },
  sender: { fullName: "Fictional sender" }, attachments: [],
};
export function liveRecords() {
  return [
    normalizePost(fictionalPost, liveProfile, LIVE_NOW)!,
    normalizeEvent(fictionalEvent, liveProfile, LIVE_NOW)!,
    normalizeThread(fictionalThread, [fictionalMessage], liveProfile, LIVE_NOW)!,
  ];
}
export function fictionalLiveSnapshot(): Snapshot {
  const records = liveRecords();
  return {
    mode: "live", household: liveProfile.household, ...liveWindow(new Date(LIVE_NOW)),
    dataset: "live-aula", scenario: "normal", connected: true, paused: false,
    agenda: records.flatMap((record) => record.structuredEvent ? [record.structuredEvent] : []),
    previews: records.filter((record) => !record.structuredEvent).map((record) => ({ id: record.upstreamId, child: record.child, source: record.source })),
    suggestions: [], brief: [], decisions: {}, lastSuccess: new Date(LIVE_NOW).toISOString(), briefAt: null,
    coverage: ["Message", "Post", "Calendar"].map((kind) => ({
      kind: kind as "Message" | "Post" | "Calendar", pages: 1, items: 1, complete: true, error: null,
      checkedAt: new Date(LIVE_NOW).toISOString(), lastSuccess: new Date(LIVE_NOW).toISOString(),
    })),
    job: null, workerOnline: true, syncError: null, stale: false,
  };
}
export const RETENTION_END = LIVE_NOW + LIVE_RETENTION_MS;
