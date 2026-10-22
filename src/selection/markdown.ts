export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: MdInline[] };

export type MdBlock =
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'list'; ordered: boolean; items: MdInline[][] };

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

// `code` | **bold** | [label](url); the url may hold one level of parentheses.
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

/** Only web links become anchors; javascript:, data: and the rest stay plain text. */
function isWebUrl(href: string): boolean {
  try {
    const { protocol } = new URL(href);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function parseInline(source: string): MdInline[] {
  const nodes: MdInline[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    if (match.index > last) nodes.push({ type: 'text', text: source.slice(last, match.index) });
    const [, code, bold, label, href] = match;
    if (code !== undefined) nodes.push({ type: 'code', text: code });
    else if (bold !== undefined) nodes.push({ type: 'strong', children: parseInline(bold) });
    else if (isWebUrl(href)) nodes.push({ type: 'link', href, children: parseInline(label) });
    else nodes.push(...parseInline(label));
    last = match.index + match[0].length;
  }
  if (last < source.length) nodes.push({ type: 'text', text: source.slice(last) });
  return nodes;
}

/** Parse the Markdown subset Selection Search renders into a tree of plain data. */
export function parseMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
      list = null;
    }
  };

  for (const line of source.split('\n')) {
    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: 'paragraph',
        children: [{ type: 'strong', children: parseInline(heading[1].trim()) }],
      });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flushParagraph();
      const ordered = numbered !== null;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item[1].trim());
    } else if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
