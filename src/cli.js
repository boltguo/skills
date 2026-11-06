import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { AGENTS, context, exists, readConfig, readState, recordKey, targets, targetRoot, withLock, writeJSON } from './store.js';
import { checkout, discover, normalizeRepo, snapshot, sameFiles } from './repository.js';
import { planInstall, applyInstall, removeInstall } from './install.js';

const HELP = `skilljet — 将 Git 仓库中的技能安装到你的 AI 工具

用法：skilljet <命令> [选项]

命令：
  install          扫描、勾选并安装技能（首次默认全选）
  update           拉取最新内容，勾选更新和新增技能
  list             查看本范围已安装的技能
  remove           勾选卸载托管技能，保留本地生成的文件
  config           配置仓库、分支和目标工具
  无命令           打开交互菜单

选项：
  --repo <地址>    仓库：owner/repo、HTTPS、SSH 或本地绝对路径
  --ref <分支/标签> 默认使用远程默认分支；传 default 恢复默认
  --agent <工具>   codex、claude、antigravity、antigravity-cli
                   多个值可用空格、逗号或重复参数分隔
  --skill <名称>   仅操作指定技能，可指定多个
  --project        安装到当前目录；不传则始终操作全局
  --all            本次重新选中所有技能，包括之前排除的技能
  --yes, -y        跳过交互，按保存的选择执行；不会覆盖冲突
  --dry-run        仅显示计划，不写入目标、配置或安装记录
  --remote         list：扫描远程仓库中的可用技能
  --help, -h       显示帮助
  --version, -v    显示版本

默认：全局 · Codex + Claude Code · 来源 boltguo/skills

示例：
  skilljet install --repo boltguo/skills
  skilljet update
  skilljet install --project
  skilljet install --agent codex claude --skill lyric-video
  skilljet update --dry-run
  skilljet update --yes
`;

function options(argv) {
  // parseArgs handles validation; expand convenient multi-value flags first.
  const expanded = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--agent' || arg === '--skill') {
      let count = 0;
      while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        for (const value of argv[++i].split(',').filter(Boolean)) { expanded.push(arg, value); count++; }
      }
      if (!count) throw new Error(`${arg} 需要参数值`);
    } else expanded.push(arg);
  }
  const { values, positionals } = parseArgs({ args: expanded, allowPositionals: true, options: {
    repo: { type: 'string' }, ref: { type: 'string' }, agent: { type: 'string', multiple: true }, skill: { type: 'string', multiple: true },
    project: { type: 'boolean' }, all: { type: 'boolean' }, yes: { type: 'boolean', short: 'y' }, 'dry-run': { type: 'boolean' },
    remote: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
  } });
  if (positionals.length > 1) throw new Error('请用 --skill 指定技能名称。');
  const command = positionals[0];
  if (command && !['install', 'update', 'list', 'remove', 'config'].includes(command)) throw new Error(`未知命令：${command}`);
  if (values.agent) {
    values.agent = [...new Set(values.agent.flatMap((v) => v.split(',')))];
    for (const a of values.agent) if (!Object.hasOwn(AGENTS, a)) throw new Error(`未知工具：${a}；可选 ${Object.keys(AGENTS).join(', ')}`);
  }
  if (values.skill) values.skill = [...new Set(values.skill.flatMap((v) => v.split(',')))];
  if (values.all && values.skill) throw new Error('--all 和 --skill 不能同时使用。');
  if (values.remote && command !== 'list') throw new Error('--remote 仅用于 list。');
  if (command === 'config' && (values.skill || values.all)) throw new Error('config 不接受 --skill 或 --all。');
  if (command === 'remove' && (values.repo || values.ref)) throw new Error('remove 按安装记录卸载，不接受 --repo 或 --ref。');
  return { command, ...values, dryRun: values['dry-run'] };
}

const interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);
const prompting = (opts) => !opts.yes && !opts.dryRun;
const scope = (ctx) => ctx.project ? `项目（${ctx.base}）` : `全局（${ctx.base}）`;

function requireTTY(opts) {
  if (prompting(opts) && !interactive()) throw new Error('非交互终端请传 --yes，或使用 --dry-run 查看计划。');
}

function configure(config, opts) {
  const next = structuredClone(config);
  next.repo = normalizeRepo(opts.repo ?? config.repo);
  if (next.repo !== normalizeRepo(config.repo)) next.excluded = [];
  if (opts.ref !== undefined) next.ref = opts.ref === 'default' ? null : opts.ref;
  if (next.ref !== null && (!next.ref || next.ref.startsWith('-'))) throw new Error('分支或标签不能为空或以 - 开头。');
  if (opts.agent) next.agents = opts.agent;
  return next;
}

async function chooseAgents(agents) {
  return checkbox({
    message: '选择目标工具（空格切换，a 全选/取消，回车继续）',
    choices: Object.entries(AGENTS).map(([value, a]) => ({ name: a.label, value, checked: agents.includes(value) })),
    validate: (values) => values.length > 0 || '至少选择一个工具。',
    loop: false,
  });
}

function header(ctx, config) {
  console.log(`\n来源  ${config.repo}${config.ref ? ` (${config.ref})` : ''}\n范围  ${scope(ctx)}`);
  for (const { root } of targets(ctx, config.agents)) console.log(`目标  ${root}`);
}

async function sync(ctx, opts) {
  requireTTY(opts);
  const initial = await readConfig(ctx);
  const config = configure(initial, opts);
  const state = await readState(ctx);
  header(ctx, config);
  console.log('正在拉取仓库…');
  const repo = await checkout(config.repo, config.ref);
  try {
    const skills = await discover(repo.dir);
    // Validate the whole repository before making changes anywhere.
    const contents = new Map();
    for (const skill of skills) contents.set(skill.name, await snapshot(skill.dir));
    const names = new Set(skills.map((s) => s.name));
    if (opts.skill) for (const name of opts.skill) if (!names.has(name)) throw new Error(`仓库中没有技能：${name}`);
    const candidates = opts.skill ? skills.filter((s) => opts.skill.includes(s.name)) : skills;
    const defaultSelected = candidates.filter((s) => opts.all || opts.skill || !config.excluded.includes(s.name)).map((s) => s.name);
    const status = (skill) => {
      const records = targets(ctx, config.agents).map(({ agent }) => state.installs[recordKey(ctx, agent, skill.name)]).filter(Boolean);
      if (config.excluded.includes(skill.name) && !opts.all && !opts.skill) return '之前已排除';
      if (!records.length) return '新发现';
      if (records.some((r) => r.repo !== config.repo)) return '来源冲突';
      if (records.length < targets(ctx, config.agents).length) return '待补装';
      return records.some((r) => !sameFiles(r.files, contents.get(skill.name))) ? '有更新' : '未变化';
    };
    const selected = prompting(opts) ? await checkbox({
      message: `${opts.command === 'update' ? '选择更新或新增的技能' : '选择要安装的技能'}（空格切换，a 全选/取消）`,
      choices: candidates.map((s) => ({ name: `${s.name}  [${status(s)}]`, value: s.name, description: s.description, checked: defaultSelected.includes(s.name) })),
      pageSize: 12, loop: false,
    }) : defaultSelected;
    if (prompting(opts) && !opts.agent && !await exists(ctx.configFile)) config.agents = await chooseAgents(config.agents);
    const excluded = new Set(config.excluded);
    for (const s of candidates) { if (selected.includes(s.name)) excluded.delete(s.name); else excluded.add(s.name); }
    config.excluded = [...excluded].sort();
    const plans = [];
    for (const skill of skills.filter((s) => selected.includes(s.name))) {
      for (const { agent } of targets(ctx, config.agents)) plans.push(await planInstall(ctx, skill, agent, config, state, contents.get(skill.name)));
    }
    const labels = { install: '安装', update: '更新', unchanged: '未变化', conflict: '冲突，跳过' };
    console.log(`\n${opts.dryRun ? '预览' : '安装计划'} · ${repo.commit.slice(0, 12)}`);
    for (const p of plans) console.log(`  ${labels[p.action]}  ${p.skill.name} → ${p.dest}${p.reason ? `\n    ${p.reason}` : ''}`);
    if (!plans.length) console.log('  未选择任何技能；现有安装保留。');
    const missing = [...new Set(Object.values(state.installs).filter((r) => r.repo === config.repo && !names.has(r.name)).map((r) => r.name))];
    if (missing.length) console.log(`  上游已移除，保留本地：${missing.join(', ')}（可用 remove 卸载）`);
    if (opts.dryRun) {
      console.log('\n仅预览，未修改目标、配置或安装记录。');
      if (plans.some((p) => p.action === 'conflict')) process.exitCode = 1;
      return;
    }
    if (prompting(opts) && !await confirm({ message: `执行以上计划并保存选择？取消勾选的已安装技能保留旧版本。`, default: true })) {
      console.log('已取消，未更改安装和配置。'); return;
    }
    await writeJSON(ctx, ctx.configFile, config);
    const counts = { install: 0, update: 0, unchanged: 0, failed: 0 };
    for (const plan of plans) {
      if (plan.action === 'conflict') { counts.failed++; continue; }
      try { await applyInstall(ctx, plan, config, state, repo.commit); counts[plan.action]++; }
      catch (e) { console.error(`  失败 ${plan.skill.name} → ${plan.dest}：${e.message}`); counts.failed++; }
    }
    console.log(`\n完成（按目标目录计）：安装 ${counts.install}，更新 ${counts.update}，未变化 ${counts.unchanged}，冲突/失败 ${counts.failed}。`);
    if (counts.failed) process.exitCode = 1;
  } finally { await repo.cleanup(); }
}

async function list(ctx, opts) {
  const config = configure(await readConfig(ctx), opts);
  const state = await readState(ctx);
  console.log(`范围  ${scope(ctx)}`);
  if (opts.remote) {
    console.log(`来源  ${config.repo}`);
    const repo = await checkout(config.repo, config.ref);
    try {
      for (const skill of await discover(repo.dir)) console.log(`${config.excluded.includes(skill.name) ? '○' : '●'} ${skill.name}\n  ${skill.description}`);
    } finally { await repo.cleanup(); }
    return;
  }
  const records = Object.values(state.installs).filter((r) => (!opts.skill || opts.skill.includes(r.name)) && (!opts.agent || opts.agent.some((a) => recordKey(ctx, a, r.name) === recordKey(ctx, r.agent, r.name))));
  if (!records.length) { console.log('尚无 skilljet 管理的安装。运行 skilljet install 开始。'); return; }
  for (const r of records) console.log(`${r.name}  ${r.commit.slice(0, 12)}${config.excluded.includes(r.name) && r.repo === config.repo ? '  [已排除更新]' : ''}\n  ${r.repo}\n  ${targetRoot(ctx, r.agent)}/${r.name}`);
}

async function configCommand(ctx, opts) {
  let config = configure(await readConfig(ctx), opts);
  if (opts.repo === undefined && opts.ref === undefined && !opts.agent && prompting(opts)) {
    requireTTY(opts);
    const repo = await input({ message: '技能仓库地址', default: config.repo, validate: (value) => { try { normalizeRepo(value); return true; } catch (e) { return e.message; } } });
    const ref = await input({ message: '分支或标签（default 表示远程默认分支）', default: config.ref || 'default' });
    config = configure(config, { repo, ref, agent: await chooseAgents(config.agents) });
  }
  header(ctx, config);
  if (opts.dryRun) { console.log('仅预览，未保存配置。'); return; }
  await writeJSON(ctx, ctx.configFile, config);
  console.log(`配置已保存：${ctx.configFile}\n更改目标不会卸载旧位置的技能；运行 install 或 update 应用。`);
}

async function remove(ctx, opts) {
  requireTTY(opts);
  const state = await readState(ctx);
  const config = configure(await readConfig(ctx), {});
  const entries = Object.entries(state.installs).filter(([, r]) => (!opts.skill || opts.skill.includes(r.name)) && (!opts.agent || opts.agent.some((a) => recordKey(ctx, a, r.name) === recordKey(ctx, r.agent, r.name))));
  if (opts.skill) for (const name of opts.skill) if (!entries.some(([, r]) => r.name === name)) throw new Error(`此范围未托管指定技能：${name}`);
  if (!entries.length) { console.log('没有可以卸载的托管技能。'); return; }
  if (!prompting(opts) && !opts.all && !opts.skill) throw new Error('非交互卸载请明确指定 --skill 或 --all。');
  const selected = prompting(opts) ? await checkbox({
    message: '选择要卸载的技能（仅删除托管文件）',
    choices: entries.map(([key, r]) => ({ name: `${r.name} → ${targetRoot(ctx, r.agent)}`, value: key, checked: Boolean(opts.all || opts.skill) })), loop: false,
  }) : entries.map(([key]) => key);
  if (!selected.length) { console.log('未选择技能，未修改。'); return; }
  console.log(`范围  ${scope(ctx)}`);
  for (const key of selected) console.log(`  卸载 ${key}`);
  if (prompting(opts) && !await confirm({ message: '卸载以上技能？本地修改会触发冲突，生成文件将保留。', default: false })) return;
  const removed = [];
  for (const key of selected) {
    const record = state.installs[key];
    try { await removeInstall(ctx, key, state, opts.dryRun); removed.push(record); }
    catch (e) { console.error(`冲突/失败：${e.message}`); process.exitCode = 1; }
  }
  if (!opts.dryRun) {
    const excluded = new Set(config.excluded);
    for (const r of removed) {
      if (r.repo === config.repo && !Object.values(state.installs).some((item) => item.name === r.name && item.repo === r.repo)) excluded.add(r.name);
    }
    config.excluded = [...excluded].sort();
    await writeJSON(ctx, ctx.configFile, config);
  }
  console.log(opts.dryRun ? '仅预览，未卸载。' : `已卸载 ${removed.length} 个目标目录中的托管技能。`);
}

export async function main(argv = process.argv.slice(2)) {
  const opts = options(argv);
  if (opts.help) { console.log(HELP); return; }
  if (opts.version) { console.log(JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')).version); return; }
  if (!opts.command) {
    requireTTY({});
    opts.command = await select({ message: 'skilljet · 默认全局安装', choices: [
      { name: '安装技能', value: 'install' }, { name: '更新技能', value: 'update' }, { name: '查看已安装', value: 'list' },
      { name: '配置仓库和工具', value: 'config' }, { name: '卸载技能', value: 'remove' },
    ] });
  }
  const ctx = context({ project: opts.project });
  const action = () => {
    if (opts.command === 'list') return list(ctx, opts);
    if (opts.command === 'config') return configCommand(ctx, opts);
    if (opts.command === 'remove') return remove(ctx, opts);
    return sync(ctx, opts);
  };
  if (opts.command === 'list' || opts.dryRun) return action();
  // Reject noninteractive operations before creating any lock or directory.
  if (opts.command !== 'config' || (!opts.repo && !opts.ref && !opts.agent)) requireTTY(opts);
  return withLock(ctx, action);
}
