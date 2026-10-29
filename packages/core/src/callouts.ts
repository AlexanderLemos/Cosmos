import type { PhrasingContent, Root, RootContent } from 'mdast';
import { toString as nodeText } from 'mdast-util-to-string';

import { calloutMarker, calloutType } from './callout-marker';

function titleText(node: PhrasingContent): string {
  if (node.type === 'html') return '';
  return 'children' in node
    ? node.children.map(titleText).join('')
    : nodeText(node);
}

// Split the first line without reparsing the body: its source offsets are needed
// by the wikilink/escape checks. Unsupported multiline leaf syntax stays literal.
function splitHeader(
  nodes: PhrasingContent[],
  boundary: number,
  source: string,
): { title: PhrasingContent[]; body: PhrasingContent[] } | undefined {
  const title: PhrasingContent[] = [];
  const body: PhrasingContent[] = [];
  for (const node of nodes) {
    const position = node.position;
    const start = position?.start.offset;
    const end = position?.end.offset;
    if (!position || start === undefined || end === undefined) return;
    if (start >= boundary) body.push(node);
    else if (end <= boundary) title.push(node);
    else if (node.type === 'text') {
      // Decoded newline entities have no corresponding source line boundary.
      if (
        /&(?:#(?:0*(?:10|13)|x0*[ad]);|NewLine;)/i.test(
          source.slice(start, boundary),
        )
      )
        return;
      const newline = /\r\n|\r|\n/.exec(node.value);
      if (!newline) return;
      title.push({ type: 'text', value: node.value.slice(0, newline.index) });
      const value = node.value.slice(newline.index + newline[0].length);
      if (value)
        body.push({
          ...node,
          value,
          position: {
            start: {
              line: position.start.line + 1,
              column: 1,
              offset: boundary,
            },
            end: position.end,
          },
        });
    } else if (node.type === 'break') {
      // The hard break belongs to the header, not the first body paragraph.
    } else if ('children' in node) {
      const split = splitHeader(node.children, boundary, source);
      if (!split) return;
      if (split.title.length)
        title.push({ ...node, children: split.title } as PhrasingContent);
      if (split.body.length)
        body.push({ ...node, children: split.body } as PhrasingContent);
    } else return;
  }
  return { title, body };
}

/** Obsidian callouts are a display transform; the vault retains its original bytes. */
export function remarkCallouts() {
  return (tree: Root, file: { toString(): string }) => {
    const source = file.toString().replace(/^\ufeff/, '');
    function walk(node: Root | RootContent) {
      if (!('children' in node)) return;
      if (node.type === 'blockquote') {
        const paragraph = node.children[0];
        const first =
          paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined;
        if (paragraph?.type === 'paragraph' && first?.type === 'text') {
          const marker = calloutMarker.exec(first.value);
          const start = first.position?.start.offset;
          if (
            marker &&
            start !== undefined &&
            source.startsWith(marker[0], start)
          ) {
            const newline = /\r\n|\r|\n/.exec(source.slice(start));
            const boundary = newline
              ? start + newline.index + newline[0].length
              : source.length;
            const split = splitHeader(paragraph.children, boundary, source);
            if (split) {
              const type = calloutType(marker[1] ?? 'note');
              const title = split.title
                .map(titleText)
                .join('')
                .slice(marker[0].length)
                .trim();
              const fold = marker[2];
              const properties = (
                node.data as
                  | { hProperties?: Record<string, unknown> }
                  | undefined
              )?.hProperties;
              node.data = {
                ...node.data,
                hName: fold ? 'details' : 'div',
                hProperties: {
                  ...properties,
                  dataCallout: type,
                  ...(fold ? { open: fold === '+' } : { role: 'note' }),
                },
              };
              node.children = [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', value: title }],
                  data: {
                    ...(!split.body.length ? paragraph.data : {}),
                    hName: fold ? 'summary' : 'div',
                    hProperties: {
                      ...(!split.body.length
                        ? (
                            paragraph.data as
                              | { hProperties?: Record<string, unknown> }
                              | undefined
                          )?.hProperties
                        : {}),
                      dataCalloutTitle: true,
                      ...(!title ? { dataCalloutDefault: type } : {}),
                    },
                  },
                },
                ...(split.body.length
                  ? [{ ...paragraph, children: split.body }]
                  : []),
                ...node.children.slice(1),
              ];
            }
          }
        }
      }
      for (const child of node.children) walk(child);
    }
    walk(tree);
  };
}
