import type { ReactNode } from 'react';
import { type MdInline, parseMarkdown } from '@/selection/markdown';

// Every node becomes a React element, so text is always escaped and model output
// never reaches innerHTML; parseMarkdown already dropped non-http(s) links.
function renderInline(nodes: MdInline[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.text;
      case 'code':
        // biome-ignore lint/suspicious/noArrayIndexKey: static, never reordered
        return <code key={i}>{node.text}</code>;
      case 'strong':
        // biome-ignore lint/suspicious/noArrayIndexKey: static, never reordered
        return <strong key={i}>{renderInline(node.children)}</strong>;
      default:
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: static, never reordered
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer">
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="llmt-md">
      {parseMarkdown(source).map((block, i) => {
        if (block.type === 'paragraph') {
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks only grow while streaming
          return <p key={i}>{renderInline(block.children)}</p>;
        }
        const List = block.ordered ? 'ol' : 'ul';
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks only grow while streaming
          <List key={i}>
            {block.items.map((item, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: items only grow while streaming
              <li key={j}>{renderInline(item)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
