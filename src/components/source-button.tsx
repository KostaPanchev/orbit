"use client";

import { useState } from "react";
import type { Source } from "@/domain/model";
import { formatSourceTime } from "@/domain/presentation";
import { Dialog } from "./dialog";
import { Icon } from "./icon";
import { useOrganizer } from "./organizer-provider";
import { SourceLinks } from "./source-links";

export function SourceButton({ source }: { source: Source }) {
  const [open, setOpen] = useState(false);
  const live = useOrganizer().state.mode === "live";
  return (
    <>
      <button className="source-button" onClick={() => setOpen(true)} aria-label={`View source: ${source.title}`}><Icon name="source" />{source.kind}<span aria-hidden="true"> · </span><time dateTime={source.timestamp}>{formatSourceTime(source.timestamp)}</time><span className="source-action">View source</span></button>
      {open && <Dialog title={source.title} onClose={() => setOpen(false)}>
        <p className="eyebrow mt-6">{live ? source.kind === "Weekly plan" ? "Original EasyIQ SkolePortal source · not an AI summary" : "Original Aula source · not an AI summary" : "Fictional Danish source"}</p>
        <dl className="source-meta">
          <div><dt>From</dt><dd>{source.author}</dd></div>
          <div><dt>Source</dt><dd>{source.kind} · {source.id}</dd></div>
          <div><dt>{source.timestampLabel ?? "Published"}</dt><dd><time dateTime={source.timestamp}>{formatSourceTime(source.timestamp)} (Europe/Copenhagen)</time></dd></div>
        </dl>
        {source.notice && <p className="notice">{source.notice}</p>}
        {source.messages?.length ? source.messages.map((message) => <section key={message.id} className="source-message">
          <h3><time dateTime={message.timestamp}>{formatSourceTime(message.timestamp)}</time> · {message.author}</h3>
          {message.excerpt.trim() ? <blockquote lang="da">{message.excerpt}</blockquote> : <p className="notice">No text was supplied for this message. Attachments and images are not processed.</p>}
        </section>) : <blockquote lang="da">{source.excerpt}</blockquote>}
        <SourceLinks source={source} />
        {source.attachment && <div className="notice warning"><strong>Attachment not processed</strong><p>{source.attachment}{live ? ". No attachment content has been imported." : " is excluded from this demo. Its contents are not reflected in the brief."}</p></div>}
        <p className="muted mt-6">{live ? "Original source text is preserved without translation or AI interpretation. Weekly-plan providers other than EasyIQ SkolePortal, sensitive content, attachments, and unread message bodies are not covered." : "This is synthetic evidence, not a live Aula message. No attachment is downloaded and no message is marked as read."}</p>
        {live && <a className="text-link" href="https://www.aula.dk/portal/" target="_blank" rel="noreferrer">Open Aula to find this source by its title</a>}
      </Dialog>}
    </>
  );
}
