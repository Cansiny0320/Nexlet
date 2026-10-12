import { createElement, useMemo, type ReactNode } from 'react';
import './updates.css';

const allowedTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 's', 'del', 'code', 'pre', 'blockquote', 'br', 'hr']);
const hiddenTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template']);

function renderNode(node: Node, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof HTMLElement)) return null;
  const tag = node.tagName.toLowerCase();
  if (hiddenTags.has(tag)) return null;
  const children = Array.from(node.childNodes, renderNode);
  // Only recreate formatting tags. Remote attributes, links and active content never reach the page.
  return allowedTags.has(tag) ? createElement(tag, { key }, tag === 'br' || tag === 'hr' ? undefined : children) : children;
}

export function ReleaseNotes({ notes }: { notes: string }) {
  const content = useMemo(() => {
    if (!/<\/?[a-z][^>]*>/i.test(notes)) return <p className="release-notes-plain">{notes}</p>;
    const template = document.createElement('template');
    template.innerHTML = notes;
    return Array.from(template.content.childNodes, renderNode);
  }, [notes]);
  return <div className="release-notes">{content}</div>;
}
