import {
  type DraftHeader,
  draftStore,
  type LocalDraft,
} from '@cosmos/fs/drafts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type DraftStatus, DraftWriter } from './draft-writer';
import type { DocumentState } from './monitor';
import type { OpenVault } from './vault';

export function useLocalDrafts(
  vault: OpenVault | null,
  doc: DocumentState | null,
) {
  const [identity, setIdentity] = useState<{
    vault: OpenVault;
    scope: string;
  } | null>(null);
  const scope = identity?.vault === vault ? identity?.scope : undefined;
  const [headers, setHeaders] = useState<DraftHeader[]>([]);
  const [scopeError, setScopeError] = useState(false);
  const [listError, setListError] = useState(false);
  const [failures, setFailures] = useState(0);
  const [status, setStatus] = useState<{
    id: string;
    state: DraftStatus;
    snapshot: LocalDraft | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [listing, setListing] = useState(0);
  const current = useRef(doc);
  current.current = doc;
  const writer = useMemo(
    () =>
      new DraftWriter(draftStore, (id, state, count, snapshot) => {
        if (current.current?.draftId === id) setStatus({ id, state, snapshot });
        setFailures(count);
      }),
    [],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries scope resolution after a storage failure.
  useEffect(() => {
    let cancelled = false;
    setScopeError(false);
    if (!vault) return;
    void (async () => {
      try {
        const id = await vault.draftScope?.();
        if (!id) throw new Error('DRAFT_SCOPE_UNAVAILABLE');
        if (!cancelled) setIdentity({ vault, scope: id });
      } catch {
        if (!cancelled) setScopeError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vault, attempt]);
  const id = doc?.draftId;
  const path = doc?.path;
  const content = doc?.content;
  const baseContent = doc?.saved;
  const baseRev = doc?.rev;
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry must capture the current draft even if its text did not change.
  useEffect(() => {
    if (
      !scope ||
      !id ||
      path === undefined ||
      content === undefined ||
      baseContent === undefined ||
      baseRev === undefined
    )
      return;
    writer.enqueue(
      id,
      scope,
      content === baseContent
        ? null
        : {
            format: 1,
            id,
            scope,
            path,
            content,
            baseContent,
            baseRev,
            version: crypto.randomUUID(),
            updatedAt: Date.now(),
          },
    );
  }, [scope, id, path, content, baseContent, baseRev, writer, attempt]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: navigation, refresh and retry invalidate the recovery listing.
  useEffect(() => {
    let cancelled = false;
    setHeaders([]);
    setListError(false);
    if (!scope) return;
    void (async () => {
      await writer.flush();
      try {
        const result = await draftStore.list(scope);
        if (!cancelled) setHeaders(result);
      } catch {
        if (!cancelled) setListError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, id, listing, attempt, writer]);
  return {
    scope,
    headers: headers.filter(
      (entry) => entry.id !== id && entry.scope === scope,
    ),
    issue: scopeError || listError || failures > 0,
    status:
      status !== null &&
      status.id === id &&
      status.snapshot?.content === content &&
      status.snapshot?.baseContent === baseContent &&
      status.snapshot?.baseRev === baseRev
        ? status.state
        : 'saving',
    refresh: () => setListing((value) => value + 1),
    retry: () => {
      writer.retry();
      setAttempt((value) => value + 1);
    },
  };
}
