import type { Metadata } from "next";
import { DemoProvider } from "@/demo/provider";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Today · Orbit", template: "%s · Orbit" },
  description: "A calm school and kindergarten overview. Interactive prototype with fictional data only.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><DemoProvider><Shell>{children}</Shell></DemoProvider></body></html>;
}
