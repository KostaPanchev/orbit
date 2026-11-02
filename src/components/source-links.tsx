import type { Source } from "@/domain/model";

export function SourceLinks({ source }: { source: Source }) {
  if (!source.links?.length) return null;
  return <ul className="lesson-links" aria-label="Lesson resources">{source.links.map((link) =>
    <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<span className="sr-only"> (opens in a new tab)</span></a></li>,
  )}</ul>;
}
