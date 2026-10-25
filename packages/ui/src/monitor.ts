import { noteLinks, resolveNoteLink } from '@cosmos/core';
import type { OpenVault } from './vault';

export type DocumentState = {
  path: string;
  content: string;
  saved: string;
  rev: string;
  readOnly: boolean;
  canOrganize?: boolean;
  generation: number;
  external?: 'changed' | 'missing' | 'unreadable';
};
export type ExternalNote =
  | {
      state: 'available';
      note: Awaited<ReturnType<OpenVault['read']>>;
      readOnly: boolean;
    }
  | { state: 'missing' | 'unreadable' };

/** Reconcile against the latest state, including keystrokes/saves made during I/O. */
export function reconcileDocument(
  current: DocumentState | null,
  observed: DocumentState | null,
  incoming: ExternalNote | null,
): DocumentState | null {
  if (
    !current ||
    !observed ||
    !incoming ||
    current.path !== observed.path ||
    current.generation !== observed.generation ||
    current.rev !== observed.rev
  )
    return current;
  if (incoming.state !== 'available')
    return { ...current, external: incoming.state };
  const access = {
    canOrganize: incoming.note.canOrganize,
    readOnly: incoming.readOnly,
  };
  if (incoming.note.rev === current.rev) {
    if (
      !current.external &&
      current.canOrganize === access.canOrganize &&
      current.readOnly === access.readOnly
    )
      return current;
    return { ...current, ...access, external: undefined };
  }
  if (current.content !== current.saved)
    return { ...current, ...access, external: 'changed' };
  return {
    ...current,
    ...incoming.note,
    ...access,
    saved: incoming.note.content,
    generation: current.generation + 1,
    external: undefined,
  };
}

export async function observeVault(
  vault: OpenVault,
  selected: DocumentState | null,
  searchTerm: string | null,
  trashOpen: boolean,
) {
  const paths = await vault.paths();
  let incoming: ExternalNote | null = null;
  let incomplete = false;
  if (selected) {
    if (!paths.includes(selected.path)) incoming = { state: 'missing' };
    else {
      try {
        incoming = {
          state: 'available',
          note: await vault.read(selected.path),
          readOnly: await vault.isReadOnly(selected.path),
        };
      } catch {
        incoming = { state: 'unreadable' };
        incomplete = true;
      }
    }
  }
  const backlinks: string[] = [];
  if (selected) {
    for (const path of paths) {
      if (path === selected.path) continue;
      try {
        const note = await vault.read(path);
        if (
          noteLinks(note.content).some(
            (link) => resolveNoteLink(link, path, paths) === selected.path,
          )
        )
          backlinks.push(path);
      } catch {
        incomplete = true;
      }
    }
  }
  return {
    paths,
    incoming,
    backlinks,
    incomplete,
    results: searchTerm === null ? null : await vault.search(searchTerm),
    trash: trashOpen ? ((await vault.listTrash?.()) ?? []) : null,
  };
}
