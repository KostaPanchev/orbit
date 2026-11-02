import type { CSSProperties } from "react";

const paths = {
  today: "M4 5h16v15H4z M8 3v4 M16 3v4 M4 10h16 M8 14h3v3H8z",
  upcoming: "M8 6h12 M8 12h12 M8 18h12 M3 6h1 M3 12h1 M3 18h1",
  schedule: "M4 5h16v15H4z M8 3v4 M16 3v4 M4 10h16 M9 10v10 M15 10v10 M4 15h16",
  review: "M9 4h6v4H9z M9 6H5v15h14V6h-4 M9 15l2 2 4-5",
  settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  source: "M6 3h8l4 4v14H6z M13 3v5h5 M9 12h6 M9 16h6",
  close: "M6 6l12 12 M18 6 6 18",
  refresh: "M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 3 M4 15l2 3a7 7 0 0 0 12-1",
  check: "M5 12l4 4L19 6",
} as const;

export function Icon({ name, style }: { name: keyof typeof paths; style?: CSSProperties }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
