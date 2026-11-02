import type { Metadata } from "next";
import { SchoolScheduleView } from "@/components/demo-views";

export const metadata: Metadata = { title: "School schedule" };

export default function Page() {
  return <SchoolScheduleView />;
}
