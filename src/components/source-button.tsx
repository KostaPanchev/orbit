"use client";

import { useState } from "react";
import type { Source } from "@/demo/fixtures";
import { formatSourceTime } from "@/demo/state";
import { Dialog } from "./dialog";
import { Icon } from "./icon";

export function SourceButton({ source }: { source: Source }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="source-button" onClick={() => setOpen(true)} aria-label={`View source: ${source.title}`}><Icon name="source" />{source.kind}<span aria-hidden="true"> · </span><time dateTime={source.timestamp}>{formatSourceTime(source.timestamp)}</time><span className="source-action">View source</span></button>
      {open && <Dialog title={source.title} onClose={() => setOpen(false)}>
        <p className="eyebrow mt-6">Fictional Danish source</p>
        <dl className="source-meta">
          <div><dt>From</dt><dd>{source.author}</dd></div>
          <div><dt>Source</dt><dd>{source.kind} · {source.id}</dd></div>
          <div><dt>Published</dt><dd><time dateTime={source.timestamp}>{formatSourceTime(source.timestamp)} (Europe/Copenhagen)</time></dd></div>
        </dl>
        <blockquote lang="da">{source.excerpt}</blockquote>
        {source.attachment && <div className="notice warning"><strong>Attachment not processed</strong><p>{source.attachment} is excluded from this demo. Its contents are not reflected in the brief.</p></div>}
        <p className="muted mt-6">This is synthetic evidence, not a live Aula message. No attachment is downloaded and no message is marked as read.</p>
      </Dialog>}
    </>
  );
}
