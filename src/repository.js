import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { exists, validName, validFile } from './store.js';

const run = promisify(execFile);
const ignored = new Set(['.git', '.agents', '.agent', '.claude', '.skilljet', 'node_modules', '__pycache__', '.DS_Store']);

export function normalizeRepo(value, cwd = process.cwd()) {
  const input = value.trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(input) && !input.startsWith('.')) return `https://github.com/${input.replace(/\.git$/, '')}.git`;
  if (/^https?:\/\//.test(input)) {
    const url = new URL(input);
    if (url.username || url.password || url.search || url.hash) throw new Error('Repository URLs must not contain credentials, query parameters, or fragments. Use Git credentials or SSH.');
    return url.href.replace(/\/$/, '').replace(/\.git$/, '') + '.git';
  }
  if (/^git@[\w.-]+:[\w./-]+$/.test(input) || /^ssh:\/\/[\w@./:~-]+$/.test(input)) return input;
  if (input.startsWith('/') || input.startsWith('./') || input.startsWith('../')) return path.resolve(cwd, input);
  throw new Error('Repository must be owner/repo, an HTTPS or SSH Git URL, or a local repository path.');
}

export async function checkout(repo, ref) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'skilljet-'));
  const dir = path.join(temp, 'repo');
  try {
    const args = ['clone', '--quiet', '--depth', '1', '--no-local'];
    if (ref) args.push('--branch', ref);
    args.push('--', repo, dir);
    await run('git', args, { timeout: 120_000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    const { stdout } = await run('git', ['-C', dir, 'rev-parse', 'HEAD']);
    return { dir, commit: stdout.trim(), cleanup: () => fs.rm(temp, { recursive: true, force: true }) };
  } catch (e) {
    await fs.rm(temp, { recursive: true, force: true });
    if (e.code === 'ENOENT') throw new Error('Git was not found. Install Git first.');
    throw new Error(`Failed to fetch repository ${repo}${ref ? ` (${ref})` : ''}: ${e.stderr?.trim() || e.message}`);
  }
}

export async function discover(root) {
  const found = [];
  async function walk(dir) {
    const manifest = path.join(dir, 'SKILL.md');
    const stat = await exists(manifest);
    if (stat) {
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`SKILL.md must be a regular file: ${manifest}`);
      const text = await fs.readFile(manifest, 'utf8');
      const front = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!front) throw new Error(`Missing YAML frontmatter: ${manifest}`);
      let meta;
      try { meta = parse(front[1], { maxAliasCount: 20 }); } catch (e) { throw new Error(`Invalid skill metadata in ${manifest}: ${e.message}`); }
      if (!meta || !validName(meta.name) || typeof meta.description !== 'string' || !meta.description.trim()) throw new Error(`Skills require a valid name and description: ${manifest}`);
      if (found.some((s) => s.name === meta.name)) throw new Error(`Duplicate skill name in repository: ${meta.name}`);
      found.push({ name: meta.name, description: meta.description.replace(/\s+/g, ' ').trim(), dir, relative: path.relative(root, dir) || '.' });
      return;
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && !ignored.has(entry.name)) await walk(path.join(dir, entry.name));
    }
  }
  await walk(root);
  if (!found.length) throw new Error('No valid SKILL.md files found in the repository.');
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fingerprint(file) {
  const stat = await exists(file);
  if (!stat?.isFile() || stat.isSymbolicLink()) return null;
  return { hash: createHash('sha256').update(await fs.readFile(file)).digest('hex'), executable: Boolean(stat.mode & 0o111) };
}

export const sameFile = (a, b) => Boolean(a && b && a.hash === b.hash && a.executable === b.executable);
export const sameFiles = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => sameFile(value, b[key]));

export async function snapshot(dir) {
  const files = Object.create(null);
  async function walk(current, prefix = '') {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!validFile(rel)) throw new Error(`Unsupported skill file path: ${rel}`);
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Skill contains a symlink; use a regular file instead: ${rel}`);
      if (entry.isDirectory()) await walk(file, rel);
      else if (entry.isFile()) files[rel] = await fingerprint(file);
      else throw new Error(`Unsupported skill file type: ${rel}`);
    }
  }
  await walk(dir);
  return files;
}
