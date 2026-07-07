import { useEffect, useState } from 'react';
import { exceedsSelectionLimit } from '@/selection/classify';

export interface SelectionTarget {
  text: string;
  rect: DOMRect;
}

function isEditable(node: Node | null): boolean {
  let el: Element | null = node instanceof Element ? node : (node?.parentElement ?? null);
  while (el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
    if (el instanceof HTMLElement && el.isContentEditable) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Track the current page text selection as a transl/dictionary target.
 * Ignores collapsed, empty, over-long, and editable-field selections.
 */
export function useSelectionTarget(): SelectionTarget | null {
  const [target, setTarget] = useState<SelectionTarget | null>(null);

  useEffect(() => {
    function update() {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';
      if (!selection || selection.isCollapsed || !text || exceedsSelectionLimit(text)) {
        setTarget(null);
        return;
      }
      if (isEditable(selection.anchorNode)) {
        setTarget(null);
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setTarget({ text, rect });
    }

    document.addEventListener('mouseup', update);
    document.addEventListener('keyup', update);
    return () => {
      document.removeEventListener('mouseup', update);
      document.removeEventListener('keyup', update);
    };
  }, []);

  return target;
}
