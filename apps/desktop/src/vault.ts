import { imageMediaType, MAX_IMAGE_BYTES } from '@cosmos/fs/images';
import { MAX_PDF_BYTES, validatePdf } from '@cosmos/fs/pdfs';
import type { VaultCommandContract, VaultReplyContract } from '@cosmos/schemas';
import type { VaultPlatform } from '@cosmos/ui';
import { invoke } from '@tauri-apps/api/core';

async function command(command: VaultCommandContract.VaultCommand) {
  return invoke<VaultReplyContract.VaultReply>('vault_execute', { command });
}
export const platform: VaultPlatform = {
  kind: 'desktop',
  open: async () => {
    const name = await invoke<string | null>('vault_open');
    if (!name) return null;
    const identity = await invoke<string>('vault_identity').catch(() => null);
    return {
      name,
      draftScope: async () => {
        if (!identity) throw new Error('DRAFT_SCOPE_UNAVAILABLE');
        return `desktop:${identity}`;
      },
      watchState: async () => {
        const result = await command({ op: 'watch' });
        if (result.kind !== 'watch_state') throw new Error('INVALID_RESPONSE');
        return result;
      },
      paths: async () => {
        const result = await command({ op: 'list' });
        if (result.kind !== 'paths') throw new Error('INVALID_RESPONSE');
        return result.paths;
      },
      read: async (path) => {
        const result = await command({ op: 'read', path });
        if (result.kind !== 'note') throw new Error('INVALID_RESPONSE');
        return { ...result, canOrganize: result.can_organize };
      },
      pdfPaths: async () => {
        const result = await command({ op: 'list_pdfs' });
        if (result.kind !== 'paths') throw new Error('INVALID_RESPONSE');
        return result.paths;
      },
      readPdf: async (path) => {
        const result = await command({ op: 'read_pdf', path });
        if (result.kind !== 'pdf' || result.path !== path)
          throw new Error('INVALID_RESPONSE');
        if (result.data_base64.length > 4 * Math.ceil(MAX_PDF_BYTES / 3))
          throw new Error('PDF_TOO_LARGE');
        const bytes = Uint8Array.from(atob(result.data_base64), (char) =>
          char.charCodeAt(0),
        );
        validatePdf(path, bytes);
        if (result.media_type !== 'application/pdf')
          throw new Error('UNSUPPORTED_PDF');
        return bytes;
      },
      imagePaths: async () => {
        const result = await command({ op: 'list_images' });
        if (result.kind !== 'paths') throw new Error('INVALID_RESPONSE');
        return result.paths;
      },
      readImage: async (path) => {
        const result = await command({ op: 'read_image', path });
        if (result.kind !== 'image' || result.path !== path)
          throw new Error('INVALID_RESPONSE');
        if (result.data_base64.length > 4 * Math.ceil(MAX_IMAGE_BYTES / 3))
          throw new Error('IMAGE_TOO_LARGE');
        const bytes = Uint8Array.from(atob(result.data_base64), (char) =>
          char.charCodeAt(0),
        );
        if (imageMediaType(path, bytes) !== result.media_type)
          throw new Error('UNSUPPORTED_IMAGE');
        return bytes;
      },
      write: async (path, content, opts) => {
        const result = await command({
          op: 'write',
          path,
          content,
          expected_rev: opts.expectedRev,
        });
        if (result.kind !== 'saved') throw new Error('INVALID_RESPONSE');
        return result;
      },
      move: async (from, to, expectedRev) => {
        const result = await command({
          op: 'move',
          from,
          to,
          expected_rev: expectedRev,
        });
        if (result.kind !== 'moved') throw new Error('INVALID_RESPONSE');
      },
      trash: async (path, expectedRev) => {
        const result = await command({
          op: 'trash',
          path,
          expected_rev: expectedRev,
        });
        if (result.kind !== 'trashed') throw new Error('INVALID_RESPONSE');
      },
      listTrash: async () => {
        const result = await command({ op: 'list_trash' });
        if (result.kind !== 'trash_entries')
          throw new Error('INVALID_RESPONSE');
        return result.entries;
      },
      restore: async (id, to, expectedRev) => {
        const result = await command({
          op: 'restore',
          id,
          to,
          expected_rev: expectedRev,
        });
        if (result.kind !== 'moved') throw new Error('INVALID_RESPONSE');
      },
      isReadOnly: async () => false,
      search: async (query) => {
        const result = await command({ op: 'search', query });
        if (result.kind !== 'paths') throw new Error('INVALID_RESPONSE');
        return result.paths;
      },
      createProject: async (name, universe) => {
        const result = await command({ op: 'create_project', name, universe });
        if (result.kind !== 'project') throw new Error('INVALID_RESPONSE');
        return result.path;
      },
    };
  },
};
