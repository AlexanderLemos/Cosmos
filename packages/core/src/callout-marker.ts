const aliases = new Map([
  ['summary', 'abstract'],
  ['tldr', 'abstract'],
  ['hint', 'tip'],
  ['important', 'tip'],
  ['check', 'success'],
  ['done', 'success'],
  ['help', 'question'],
  ['faq', 'question'],
  ['caution', 'warning'],
  ['attention', 'warning'],
  ['fail', 'failure'],
  ['missing', 'failure'],
  ['error', 'danger'],
  ['cite', 'quote'],
]);
const types = new Set([
  'note',
  'abstract',
  'info',
  'todo',
  'tip',
  'success',
  'question',
  'warning',
  'failure',
  'danger',
  'bug',
  'example',
  'quote',
]);

/** Shared normalization for reading and visual editing. Unknown types are notes. */
export function calloutType(value: string): string {
  const type = value.toLowerCase();
  return aliases.get(type) ?? (types.has(type) ? type : 'note');
}

export const calloutMarker = /^\[!([a-z][a-z\d-]{0,63})\]([+-]?)(?=\s|$)/i;
