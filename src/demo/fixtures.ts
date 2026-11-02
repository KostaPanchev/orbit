import { DEMO_DATE, type Source, type AgendaEntry, type Suggestion, type BriefItem } from "../domain/model";

const trip: Source = {
  id: "post-trip-v1",
  kind: "Post",
  title: "2B visits the nature centre",
  author: "Maja · Lindely School",
  timestamp: "2026-11-01T15:15:00+01:00",
  excerpt: "Onsdag den 4. november skal 2B på tur til Naturcenteret. Husk madpakke, drikkedunk og regntøj. Vi skriver tidspunktet senere.",
  attachment: "Packing-list.pdf",
};
const consent: Source = {
  id: "message-consent-v1",
  kind: "Message",
  title: "Permission for the nature trip",
  author: "Maja · Lindely School",
  timestamp: "2026-11-02T07:10:00+01:00",
  excerpt: "Husk at give samtykke til turen til Naturcenteret senest tirsdag den 3. november. Svar på beskeden i Aula.",
};
const gathering: Source = {
  id: "post-gathering-v1",
  kind: "Post",
  title: "A little autumn gathering",
  author: "Sofie · Birch Kindergarten",
  timestamp: "2026-11-01T16:00:00+01:00",
  excerpt: "Vi vil gerne invitere til eftermiddagshygge en fredag i november i Birkens fællesrum. Dato og tidspunkt er ikke fastlagt endnu.",
};
const oldLantern: Source = {
  id: "message-lantern-v1",
  kind: "Message",
  title: "Lantern walk · original",
  author: "Sofie · Birch Kindergarten",
  timestamp: "2026-10-29T14:00:00+01:00",
  excerpt: "Vi mødes til lanternefest torsdag den 12. november kl. 16.00 i børnehavens gård.",
};
const lantern: Source = {
  id: "message-lantern-v2",
  kind: "Message",
  title: "Lantern walk · updated",
  author: "Sofie · Birch Kindergarten",
  timestamp: "2026-11-02T07:20:00+01:00",
  excerpt: "Lanternefesten er flyttet til fredag den 13. november kl. 16.30. Vi mødes i haven i stedet for gården.",
};
const music: Source = {
  id: "calendar-music-v1",
  kind: "Calendar",
  title: "Music afternoon",
  author: "Lindely School · calendar",
  timestamp: "2026-10-30T12:00:00+01:00",
  excerpt: "Musikeftermiddag for 2B mandag den 2. november kl. 14.00 i musiklokalet. Forældre er velkomne.",
};
const photo: Source = {
  id: "calendar-photo-v1",
  kind: "Calendar",
  title: "Kindergarten photo day",
  author: "Birch Kindergarten · calendar",
  timestamp: "2026-10-28T09:00:00+01:00",
  excerpt: "Fotografering i Birken fredag den 6. november. Tidspunkt følger.",
};
const singing: Source = {
  id: "calendar-singing-v1",
  kind: "Calendar",
  title: "Winter songs",
  author: "Lindely School · calendar",
  timestamp: "2026-10-28T11:00:00+01:00",
  excerpt: "Fællessang onsdag den 25. november kl. 15.00 i skolens sal.",
};
const library: Source = {
  id: "message-library-v1",
  kind: "Message",
  title: "Library books due today",
  author: "Maja · Lindely School",
  timestamp: "2026-11-02T07:25:00+01:00",
  excerpt: "Husk at aflevere biblioteksbøgerne i dag, mandag den 2. november.",
};

export const initialAgenda: AgendaEntry[] = [
  { id: "music", child: "emma", title: "Music afternoon", date: DEMO_DATE, time: "14:00", location: "Music room", source: music, origin: "Structured calendar" },
  { id: "photo", child: "alex", title: "Kindergarten photo day", date: "2026-11-06", time: "", location: "", source: photo, origin: "Structured calendar" },
  { id: "lantern", child: "alex", title: "Lantern walk + raincoats", date: "2026-11-12", time: "16:00", location: "Kindergarten courtyard", source: oldLantern, origin: "Approved suggestion" },
  { id: "singing", child: "emma", title: "Winter songs", date: "2026-11-25", time: "15:00", location: "School hall", source: singing, origin: "Structured calendar" },
];

export const suggestions: Suggestion[] = [
  { id: "consent", child: "emma", title: "Trip permission deadline", date: "2026-11-03", time: "", location: "", source: consent, summary: "Reply in Aula by Tuesday to give permission for the nature trip." },
  { id: "trip", child: "emma", title: "Visit to the nature centre", date: "2026-11-04", time: "", location: "Nature centre", source: trip, summary: "Pack lunch, a water bottle, and rainwear.", uncertainty: "Departure time has not been shared. Keep this date-only; the attachment is not processed." },
  { id: "lantern-update", child: "alex", title: "Lantern walk", date: "2026-11-13", time: "16:30", location: "Kindergarten garden", source: lantern, summary: "Moved from Thursday 12 Nov at 16:00 to Friday 13 Nov at 16:30, now in the garden.", replacesId: "lantern" },
  { id: "gathering", child: "alex", title: "Autumn gathering", date: null, time: "", location: "Kindergarten common room", source: gathering, summary: "An afternoon together is being planned for a Friday in November.", uncertainty: "Neither the date nor the time is confirmed. Leave in review until you can confirm a date." },
  { id: "library", child: "emma", title: "Return library books", date: DEMO_DATE, time: "", location: "", source: library, summary: "An extra task in the busy-day demo: return the library books today.", busyOnly: true },
];

export const brief: BriefItem[] = [
  { id: "permission", child: "emma", label: "By tomorrow", title: "A quick reply before the trip", summary: "Emma's class needs permission by Tuesday, 3 November. Reply in Aula; adding the deadline here does not send consent.", source: consent },
  { id: "trip", child: "emma", label: "Wednesday", title: "Rainwear, lunch, and a little adventure", summary: "2B visits the nature centre on 4 November. The departure time is still to come, and the packing-list attachment has not been processed.", source: trip },
  { id: "lantern", child: "alex", label: "Changed", title: "The lantern walk has moved", summary: "Friday, 13 November at 16:30 in the kindergarten garden. Your existing agenda entry is unchanged until you review the revision.", source: lantern },
  { id: "library", child: "emma", label: "Today", title: "One more thing for the school bag", summary: "Return Emma's library books today. This extra item is part of the busy-day demo.", source: library, busyOnly: true },
];
