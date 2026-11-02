import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { OrganizerProvider } from "@/components/organizer-provider";
import { Shell } from "@/components/shell";
import { activeDataset, getDatabase } from "@/server/db/client";
import { getSnapshot } from "@/server/services/organizer";
import { assertLocalRequest } from "@/server/local-access";
import { DomainError } from "@/domain/model";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Overview · Orbit", template: "%s · Orbit" },
  description: "A calm local school and kindergarten organizer. Read-only source previews and calendar events, without AI.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  try { assertLocalRequest(await headers()); }
  catch (error) { if (error instanceof DomainError) notFound(); throw error; }
  const initialState = getSnapshot(getDatabase(), activeDataset());
  return <html lang="en"><body><OrganizerProvider initialState={initialState}><Shell>{children}</Shell></OrganizerProvider></body></html>;
}
