import type { Paragraph, Root, RootContent } from 'mdast';

export function blockId(id: string): string | undefined {
  return /^[A-Za-z0-9-]+$/.test(id) ? `cosmos-block-${id}` : undefined;
}

/** Display-only Obsidian block anchors. Raw source checks exclude escaped/entity syntax. */
export function remarkBlocks() {
  return (tree: Root, file: { toString(): string }) => {
    const source = file.toString().replace(/^\ufeff/, '');
    const candidates: {
      id: string;
      target: RootContent;
      removeMarker: () => void;
    }[] = [];
    const removals = new Set<RootContent>();

    function marker(node: Paragraph) {
      const last = node.children.at(-1);
      if (last?.type !== 'text') return;
      const match = /(?:^|\s)\^([A-Za-z0-9-]+)[ \t]*$/.exec(last.value);
      if (!match) return;
      const raw = source.slice(
        last.position?.start.offset,
        last.position?.end.offset,
      );
      if (!raw.endsWith(match[0])) return;
      return { text: last, start: match.index, id: match[1] as string };
    }

    function walk(parent: Root | RootContent) {
      if (!('children' in parent)) return;
      for (const [index, child] of parent.children.entries()) {
        if (child.type === 'paragraph') {
          const found = marker(child);
          if (!found) continue;
          const standalone =
            child.children.length === 1 &&
            !found.text.value.slice(0, found.start).trim();
          if (standalone) {
            const previous = parent.children[index - 1];
            if (
              !previous ||
              !['paragraph', 'list', 'blockquote', 'table'].includes(
                previous.type,
              )
            )
              continue;
            // A sequence of markers must not create an anchor on another marker.
            if (
              previous.type === 'paragraph' &&
              previous.children.length === 1 &&
              previous.children[0]?.type === 'text' &&
              /^\s*\^[A-Za-z0-9-]+\s*$/.test(previous.children[0].value)
            )
              continue;
            candidates.push({
              id: found.id,
              target: previous,
              removeMarker: () => {
                removals.add(child);
              },
            });
          } else {
            candidates.push({
              id: found.id,
              // Tight lists omit their paragraph wrapper in HTML; anchor the item instead.
              target: parent.type === 'listItem' ? parent : child,
              removeMarker: () => {
                found.text.value = found.text.value.slice(0, found.start);
              },
            });
          }
        } else walk(child);
      }
    }
    walk(tree);
    const idCounts = new Map<string, number>();
    const targetCounts = new Map<RootContent, number>();
    for (const { id, target } of candidates) {
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
      targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1);
    }
    for (const { id, target, removeMarker } of candidates) {
      // Never silently choose one of several blocks or IDs for the same target.
      if (idCounts.get(id) !== 1 || targetCounts.get(target) !== 1) continue;
      target.data = {
        ...target.data,
        hProperties: { id: blockId(id) },
      };
      removeMarker();
    }
    function prune(node: Root | RootContent) {
      if (!('children' in node)) return;
      node.children = node.children.filter(
        (child) => !removals.has(child),
      ) as typeof node.children;
      node.children.forEach(prune);
    }
    prune(tree);
  };
}
