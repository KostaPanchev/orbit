import type { Metadata } from "next";
import { SettingsView } from "@/components/demo-views";

export const metadata: Metadata = { title: "Demo settings" };

export default function Page() {
  return <SettingsView />;
}
