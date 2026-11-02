"use client";

import type { ChildId } from "@/domain/model";
import { useOrganizer } from "./organizer-provider";

export function ChildLabel({ child, institution = false }: { child: ChildId; institution?: boolean }) {
  const { state } = useOrganizer();
  const info = state.household[child];
  if (!info) return <span className="child-label">Audience unavailable</span>;
  return <span className={`child-label ${child}`}><span className="child-dot" aria-hidden="true">{info.initial}</span>{info.name}{institution && <span className="institution"> · {info.institution}</span>}</span>;
}
