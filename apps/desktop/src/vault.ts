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
    return {
      name,
      paths: async () => {
        const result = await command({ op: 'list' });
        if (result.kind !== 'paths') throw new Error('INVALID_RESPONSE');
        return result.paths;
      },
      read: async (path) => {
        const result = await command({ op: 'read', path });
        if (result.kind !== 'note') throw new Error('INVALID_RESPONSE');
        return result;
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
