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
 * Read the current page selection as a target, or null when it isn't a valid
 * translation target (collapsed, empty, over-long, or inside an editable field).
 */
export function readSelectionTarget(): SelectionTarget | null {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? '';
  if (!selection || selection.isCollapsed || !text || exceedsSelectionLimit(text)) return null;
  if (isEditable(selection.anchorNode)) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return { text, rect };
}

/**
 * Track the current page text selection as a translation/dictionary target.
 * Ignores collapsed, empty, over-long, and editable-field selections.
 */
export function useSelectionTarget(): SelectionTarget | null {
  const [target, setTarget] = useState<SelectionTarget | null>(null);

  useEffect(() => {
    function update() {
      setTarget(readSelectionTarget());
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
