import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

export const AGENTS = {
  codex: { label: 'Codex', global: '.agents/skills', project: '.agents/skills' },
  claude: { label: 'Claude Code', global: '.claude/skills', project: '.claude/skills' },
  antigravity: { label: 'Antigravity App / IDE', global: '.gemini/config/skills', project: '.agents/skills' },
  'antigravity-cli': { label: 'Antigravity CLI', global: '.gemini/antigravity-cli/skills', project: '.agents/skills' },
};
export const DEFAULTS = { version: 1, repo: 'boltguo/skills', ref: null, agents: ['codex', 'claude'], excluded: [] };
export const validName = (name) => typeof name === 'string' && name.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
export const validFile = (name) => typeof name === 'string' && name.length > 0 && !name.includes('\\') && !path.posix.isAbsolute(name) && name.split('/').every((p) => p && p !== '.' && p !== '..');

export function context({ project = false, cwd = process.cwd(), home = os.homedir() } = {}) {
  const base = path.resolve(project ? cwd : home);
  const dir = project ? path.join(base, '.skilljet') : path.join(base, '.config', 'skilljet');
  return { project, base, home, dir, configFile: path.join(dir, 'config.json'), stateFile: path.join(dir, 'state.json') };
}

export async function exists(file) {
  try { return await fs.lstat(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

export async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return structuredClone(fallback);
    throw new Error(`无法读取 ${file}：${e.message}`);
  }
}

export async function readConfig(ctx) {
  const local = await readJSON(ctx.configFile, null);
  const inherited = !local && ctx.project ? await readJSON(context({ home: ctx.home }).configFile, null) : null;
  const config = { ...structuredClone(DEFAULTS), ...(local || inherited || {}) };
  if (!local) config.excluded = [];
  if (config.version !== 1 || typeof config.repo !== 'string' || !config.repo ||
      !(config.ref === null || (typeof config.ref === 'string' && config.ref && !config.ref.startsWith('-'))) ||
      !Array.isArray(config.agents) || !config.agents.length || config.agents.some((a) => !Object.hasOwn(AGENTS, a)) ||
      !Array.isArray(config.excluded) || config.excluded.some((n) => !validName(n))) {
    throw new Error(`配置格式无效：${ctx.configFile}`);
  }
  config.agents = [...new Set(config.agents)];
  return config;
}

export async function readState(ctx) {
  const state = await readJSON(ctx.stateFile, { version: 1, installs: {} });
  if (state.version !== 1 || !state.installs || typeof state.installs !== 'object' || Array.isArray(state.installs)) throw new Error(`安装记录格式无效：${ctx.stateFile}`);
  for (const [key, item] of Object.entries(state.installs)) {
    if (!item || !validName(item.name) || !Object.hasOwn(AGENTS, item.agent) || key !== recordKey(ctx, item.agent, item.name) ||
        typeof item.repo !== 'string' || typeof item.commit !== 'string' ||
        !item.files || typeof item.files !== 'object' || Array.isArray(item.files) || !Object.hasOwn(item.files, 'SKILL.md') ||
        Object.entries(item.files).some(([f, v]) => !validFile(f) || !v || !/^[a-f0-9]{64}$/.test(v.hash) || typeof v.executable !== 'boolean')) {
      throw new Error(`安装记录无效：${ctx.stateFile} (${key})`);
    }
  }
  return state;
}

// Inspect only descendants of the scope root; never follow a destination symlink.
export async function assertSafe(ctx, file) {
  const rel = path.relative(ctx.base, file);
  if (!rel || rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) throw new Error(`路径超出安装范围：${file}`);
  let current = ctx.base;
  const parts = rel.split(path.sep);
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = await exists(current);
    if (!stat) break;
    if (stat.isSymbolicLink()) throw new Error(`路径是符号链接，未覆盖：${current}`);
    if (i < parts.length - 1 && !stat.isDirectory()) throw new Error(`父路径不是目录：${current}`);
  }
}

export async function writeJSON(ctx, file, value) {
  await assertSafe(ctx, file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
}

export function targetRoot(ctx, agent) {
  return path.join(ctx.base, AGENTS[agent][ctx.project ? 'project' : 'global']);
}

export function recordKey(ctx, agent, name) {
  return `${AGENTS[agent][ctx.project ? 'project' : 'global']}/${name}`;
}

export function targets(ctx, agents) {
  return [...new Map(agents.map((agent) => [targetRoot(ctx, agent), { agent, root: targetRoot(ctx, agent) }])).values()];
}

export async function withLock(ctx, action) {
  const file = path.join(ctx.dir, 'lock');
  await assertSafe(ctx, file);
  await fs.mkdir(ctx.dir, { recursive: true });
  let handle;
  try { handle = await fs.open(file, 'wx', 0o600); }
  catch (e) {
    if (e.code === 'EEXIST') throw new Error(`此范围已有任务运行：${file}。若上次进程异常退出，请确认没有 skilljet 进程后删除该锁文件。`);
    throw e;
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    return await action();
  } finally { await handle.close(); await fs.rm(file, { force: true }); }
}
