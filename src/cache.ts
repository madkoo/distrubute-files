import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import simpleGit from 'simple-git';

export const CACHE_BASE = path.join(os.homedir(), '.dfiles', 'cache');

/**
 * SHA-256 of repoUrl, first 16 hex chars. Deterministic, collision-resistant.
 */
export function getRepoHash(repoUrl: string): string {
  return crypto.createHash('sha256').update(repoUrl).digest('hex').slice(0, 16);
}

/**
 * Returns path.join(CACHE_BASE, getRepoHash(repoUrl))
 */
export function getCacheDir(repoUrl: string): string {
  return path.join(CACHE_BASE, getRepoHash(repoUrl));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Main function: ensures repo is cloned and up-to-date.
 *
 * Steps:
 * 1. fs.mkdirSync(CACHE_BASE, { recursive: true })
 * 2. Check if cacheDir exists AND is a valid git repo (use simpleGit(cacheDir).checkIsRepo())
 *    - If checkIsRepo throws or the dir doesn't exist: treat as "not cached"
 * 3. If NOT cached:
 *    - If cacheDir exists but is corrupt: delete it first (fs.rmSync with { recursive: true, force: true })
 *    - Clone: await simpleGit().clone(repoUrl, cacheDir, ['--depth', '1', '--branch', branch])
 * 4. If cached:
 *    - const git = simpleGit(cacheDir)
 *    - await git.fetch('origin', branch)
 *    - await git.checkout(branch)
 *    - await git.pull('origin', branch)
 * 5. Returns cacheDir
 *
 * Errors from simple-git are re-thrown with context.
 */
export async function ensureCached(repoUrl: string, branch: string): Promise<string> {
  fs.mkdirSync(CACHE_BASE, { recursive: true });

  const cacheDir = getCacheDir(repoUrl);
  const cacheDirExists = fs.existsSync(cacheDir);
  let isCached = false;

  if (cacheDirExists) {
    try {
      const stat = fs.statSync(cacheDir);
      if (stat.isDirectory()) {
        isCached = await simpleGit(cacheDir).checkIsRepo();
      }
    } catch {
      isCached = false;
    }
  }

  if (!isCached) {
    if (cacheDirExists) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }

    try {
      await simpleGit().clone(repoUrl, cacheDir, ['--depth', '1', '--branch', branch]);
    } catch (error) {
      throw new Error(
        `Failed to clone repository "${repoUrl}" (branch "${branch}") into cache "${cacheDir}": ${toErrorMessage(error)}`
      );
    }

    return cacheDir;
  }

  const git = simpleGit(cacheDir);
  try {
    await git.fetch('origin', branch);
    await git.checkout(branch);
    await git.pull('origin', branch);
  } catch (error) {
    throw new Error(
      `Failed to update cached repository "${repoUrl}" (branch "${branch}") at "${cacheDir}": ${toErrorMessage(error)}`
    );
  }

  return cacheDir;
}
