import type { Metadata } from "next";
import { OrganizerProvider } from "@/components/organizer-provider";
import { Shell } from "@/components/shell";
import { activeDataset, getDatabase } from "@/server/db/client";
import { getSnapshot } from "@/server/services/organizer";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Today · Orbit", template: "%s · Orbit" },
  description: "A calm local school and kindergarten organizer with synthetic data only.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialState = getSnapshot(getDatabase(), activeDataset());
  return <html lang="en"><body><OrganizerProvider initialState={initialState}><Shell>{children}</Shell></OrganizerProvider></body></html>;
}
