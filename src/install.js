import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { exists, assertSafe, recordKey, targetRoot, writeJSON } from './store.js';
import { fingerprint, sameFile, sameFiles } from './repository.js';

async function verifyManaged(ctx, dest, record) {
  for (const [file, expected] of Object.entries(record.files)) {
    const full = path.join(dest, file);
    await assertSafe(ctx, full);
    if (!sameFile(await fingerprint(full), expected)) return `本地文件已修改或缺失：${file}`;
  }
  return null;
}

export async function planInstall(ctx, skill, agent, config, state, files) {
  const key = recordKey(ctx, agent, skill.name);
  const record = state.installs[key];
  const dest = path.join(targetRoot(ctx, agent), skill.name);
  const plan = { key, dest, agent, skill, files, record, action: 'install' };
  try {
    await assertSafe(ctx, dest);
    const stat = await exists(dest);
    if (record && record.repo !== config.repo) throw new Error(`同名技能来自另一个仓库：${record.repo}`);
    if (stat && !record) throw new Error('目标目录已存在，但不属于 skilljet 管理');
    if (stat && !stat.isDirectory()) throw new Error('目标路径不是目录');
    if (stat && record) {
      const changed = await verifyManaged(ctx, dest, record);
      if (changed) throw new Error(changed);
      for (const file of Object.keys(files)) {
        const full = path.join(dest, file);
        await assertSafe(ctx, full);
        if (!Object.hasOwn(record.files, file) && await exists(full)) throw new Error(`新文件与本地非托管内容冲突：${file}`);
      }
      plan.action = sameFiles(files, record.files) ? 'unchanged' : 'update';
    }
  } catch (e) { plan.action = 'conflict'; plan.reason = e.message; }
  return plan;
}

async function pruneEmpty(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const child = path.join(dir, entry.name);
      await pruneEmpty(child);
      if (!(await fs.readdir(child)).length) await fs.rmdir(child);
    }
  }
}

// Swap only after staging succeeds. Restore the previous directory if saving state fails.
async function swap(dest, stage, commit) {
  const backup = `${dest}.skilljet-backup-${randomUUID()}`;
  const hadPrevious = Boolean(await exists(dest));
  if (hadPrevious) await fs.rename(dest, backup);
  let placed = false;
  try {
    await fs.rename(stage, dest);
    placed = true;
    await commit();
  } catch (error) {
    if (placed) await fs.rm(dest, { recursive: true, force: true });
    if (hadPrevious) await fs.rename(backup, dest);
    throw error;
  }
  if (hadPrevious) {
    try { await fs.rm(backup, { recursive: true, force: true }); }
    catch { console.warn(`更新成功，但旧备份未能清理：${backup}`); }
  }
}

export async function applyInstall(ctx, plan, config, state, commit) {
  if (plan.action === 'conflict' || plan.action === 'unchanged') return;
  const fresh = await planInstall(ctx, plan.skill, plan.agent, config, state, plan.files);
  if (fresh.action === 'conflict') throw new Error(fresh.reason);
  await assertSafe(ctx, plan.dest);
  await fs.mkdir(path.dirname(plan.dest), { recursive: true });
  const stage = await fs.mkdtemp(path.join(path.dirname(plan.dest), '.skilljet-stage-'));
  try {
    if (await exists(plan.dest)) {
      await fs.cp(plan.dest, stage, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
      for (const file of Object.keys(plan.record.files)) await fs.rm(path.join(stage, file));
      await pruneEmpty(stage);
    }
    for (const [file, meta] of Object.entries(plan.files)) {
      const output = path.join(stage, file);
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.copyFile(path.join(plan.skill.dir, file), output);
      await fs.chmod(output, meta.executable ? 0o755 : 0o644);
    }
    const recheck = await planInstall(ctx, plan.skill, plan.agent, config, state, plan.files);
    if (recheck.action === 'conflict') throw new Error(recheck.reason);
    const next = { ...state.installs, [plan.key]: { name: plan.skill.name, agent: plan.agent, repo: config.repo, ref: config.ref, commit, files: plan.files } };
    await swap(plan.dest, stage, async () => {
      await writeJSON(ctx, ctx.stateFile, { version: 1, installs: next });
      state.installs = next;
    });
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
}

export async function removeInstall(ctx, key, state, dryRun = false) {
  const record = state.installs[key];
  const dest = path.join(targetRoot(ctx, record.agent), record.name);
  await assertSafe(ctx, dest);
  const stat = await exists(dest);
  if (stat && !stat.isDirectory()) throw new Error(`目标不是目录：${dest}`);
  if (stat) {
    const changed = await verifyManaged(ctx, dest, record);
    if (changed) throw new Error(`${record.name}：${changed}，未卸载`);
  }
  if (dryRun) return;
  const next = { ...state.installs };
  delete next[key];
  const save = async () => {
    await writeJSON(ctx, ctx.stateFile, { version: 1, installs: next });
    state.installs = next;
  };
  if (!stat) { await save(); return; }
  const stage = await fs.mkdtemp(path.join(path.dirname(dest), '.skilljet-stage-'));
  try {
    await fs.cp(dest, stage, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
    for (const file of Object.keys(record.files)) await fs.rm(path.join(stage, file));
    await pruneEmpty(stage);
    const changed = await verifyManaged(ctx, dest, record);
    if (changed) throw new Error(changed);
    await swap(dest, stage, save);
    if (!(await fs.readdir(dest)).length) await fs.rmdir(dest);
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
}
