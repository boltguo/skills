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
    if (url.username || url.password || url.search || url.hash) throw new Error('仓库 URL 不应包含账号、密码、查询参数或片段；请使用 Git 凭据或 SSH。');
    return url.href.replace(/\/$/, '').replace(/\.git$/, '') + '.git';
  }
  if (/^git@[\w.-]+:[\w./-]+$/.test(input) || /^ssh:\/\/[\w@./:~-]+$/.test(input)) return input;
  if (input.startsWith('/') || input.startsWith('./') || input.startsWith('../')) return path.resolve(cwd, input);
  throw new Error('仓库格式应为 owner/repo、HTTPS / SSH Git 地址或本地仓库绝对路径。');
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
    if (e.code === 'ENOENT') throw new Error('找不到 Git，请先安装 Git。');
    throw new Error(`无法拉取仓库 ${repo}${ref ? ` (${ref})` : ''}：${e.stderr?.trim() || e.message}`);
  }
}

export async function discover(root) {
  const found = [];
  async function walk(dir) {
    const manifest = path.join(dir, 'SKILL.md');
    const stat = await exists(manifest);
    if (stat) {
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`SKILL.md 必须是普通文件：${manifest}`);
      const text = await fs.readFile(manifest, 'utf8');
      const front = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!front) throw new Error(`缺少 YAML frontmatter：${manifest}`);
      let meta;
      try { meta = parse(front[1], { maxAliasCount: 20 }); } catch (e) { throw new Error(`无效的技能元数据 ${manifest}：${e.message}`); }
      if (!meta || !validName(meta.name) || typeof meta.description !== 'string' || !meta.description.trim()) throw new Error(`技能需要有效的 name 和 description：${manifest}`);
      if (found.some((s) => s.name === meta.name)) throw new Error(`仓库存在重名技能：${meta.name}`);
      found.push({ name: meta.name, description: meta.description.replace(/\s+/g, ' ').trim(), dir, relative: path.relative(root, dir) || '.' });
      return;
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && !ignored.has(entry.name)) await walk(path.join(dir, entry.name));
    }
  }
  await walk(root);
  if (!found.length) throw new Error('仓库中没有发现有效的 SKILL.md。');
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
      if (!validFile(rel)) throw new Error(`不支持的技能文件路径：${rel}`);
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`技能内包含符号链接，请改用普通文件：${rel}`);
      if (entry.isDirectory()) await walk(file, rel);
      else if (entry.isFile()) files[rel] = await fingerprint(file);
      else throw new Error(`不支持的技能文件类型：${rel}`);
    }
  }
  await walk(dir);
  return files;
}
