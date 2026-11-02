import type { Metadata } from "next";
import { ReviewView } from "@/components/demo-views";

export const metadata: Metadata = { title: "Review" };

export default function Page() {
  return <ReviewView />;
}
