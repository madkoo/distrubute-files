import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ManifestEntry } from './types';
import { resolvePath } from './config';

/**
 * Returns SHA-256 hash of file contents, or null if file doesn't exist.
 */
export function fileHash(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Syncs a single entry from its cached repo location to its destination.
 */
export async function syncEntry(
  entry: ManifestEntry,
  cacheDir: string
): Promise<'updated' | 'unchanged'> {
  const sourcePath = path.join(cacheDir, entry.source);
  const destPath = resolvePath(entry.destination);

  let sourceStat: fs.Stats;
  try {
    sourceStat = fs.statSync(sourcePath);
  } catch {
    throw new Error(
      `Source path "${entry.source}" does not exist in cache "${cacheDir}" (resolved: "${sourcePath}").`
    );
  }

  if (sourceStat.isFile()) {
    const sourceDigest = fileHash(sourcePath);
    const destinationDigest = fileHash(destPath);

    if (sourceDigest !== null && sourceDigest === destinationDigest) {
      return 'unchanged';
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(sourcePath, destPath);
    return 'updated';
  }

  if (sourceStat.isDirectory()) {
    fs.mkdirSync(destPath, { recursive: true });
    fs.cpSync(sourcePath, destPath, { recursive: true });
    return 'updated';
  }

  throw new Error(
    `Source path "${sourcePath}" in cache is neither a regular file nor a directory and cannot be synced.`
  );
}