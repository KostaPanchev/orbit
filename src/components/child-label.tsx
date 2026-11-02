import { children, type ChildId } from "@/domain/model";

export function ChildLabel({ child, institution = false }: { child: ChildId; institution?: boolean }) {
  const info = children[child];
  return <span className={`child-label ${child}`}><span className="child-dot" aria-hidden="true">{info.initial}</span>{info.name}{institution && <span className="institution"> · {info.institution}</span>}</span>;
}
