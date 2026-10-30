import { imageTarget, resolveImageTarget } from '@cosmos/core';
import { imageMediaType } from '@cosmos/fs/images';
import type { OpenVault } from './vault';

/** Shared by reading and visual editing; cancellation also avoids a queued read. */
export async function readLocalImage(
  src: string,
  from: string,
  vault: OpenVault | null,
  current: () => boolean,
): Promise<Blob | undefined> {
  const target = imageTarget(src);
  if (!target || !vault?.imagePaths || !vault.readImage)
    throw new Error('IMAGE_UNRESOLVED');
  const paths = await vault.imagePaths();
  if (!current()) return;
  const path = resolveImageTarget(target, from, paths);
  if (!path) throw new Error('IMAGE_UNRESOLVED');
  const bytes = await vault.readImage(path);
  if (!current()) return;
  return new Blob([bytes], { type: imageMediaType(path, bytes) });
}
