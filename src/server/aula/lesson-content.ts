import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { lessonLinkSchema } from "../../domain/model";

type Node = DefaultTreeAdapterMap["node"];
const excluded = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "form", "template", "img"]);
const blocks = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "ul", "ol"]);

export function lessonContent(html: string) {
  const links: { label: string; url: string }[] = [];
  let omittedLinks = 0;
  const text = (node: Node): string => {
    if ("tagName" in node && excluded.has(node.tagName)) return "";
    if ("value" in node) return node.value;
    if (!("childNodes" in node)) return "";
    const content = node.childNodes.map(text).join("");
    if (!("tagName" in node)) return content;
    if (node.tagName === "a") {
      const href = node.attrs.find((attribute) => attribute.name === "href")?.value;
      if (href) {
        const link = lessonLinkSchema.safeParse({ url: href, label: content.trim().slice(0, 500) || "Lesson resource" });
        if (link.success && links.length < 100) {
          if (!links.some((item) => item.url === link.data.url)) links.push(link.data);
        } else {
          omittedLinks++;
          return "[Link omitted]";
        }
      }
    }
    if (node.tagName === "br") return "\n";
    return blocks.has(node.tagName) ? `${node.tagName === "li" ? "- " : ""}${content}\n` : content;
  };
  const plain = text(parseFragment(html)).replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: plain, links, omittedLinks };
}
