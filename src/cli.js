import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { AGENTS, context, exists, readConfig, readState, recordKey, targets, targetRoot, withLock, writeJSON } from './store.js';
import { checkout, discover, normalizeRepo, snapshot, sameFiles } from './repository.js';
import { planInstall, applyInstall, removeInstall } from './install.js';

const HELP = `skilljet - Install Git-hosted skills for your AI tools

Usage: skilljet <command> [options]

Commands:
  install          Scan, select, and install skills (all selected initially)
  update           Fetch changes and select updated or newly added skills
  list             Show managed installations in the selected scope
  remove           Select skills to uninstall; preserve generated files
  config           Configure the repository, ref, and target tools
  (no command)     Open the interactive menu

Options:
  --repo <source>  owner/repo, an HTTPS or SSH Git URL, or a local path
  --ref <ref>      Branch or tag; use default to follow the default branch
  --agent <tool>   codex, claude, antigravity, antigravity-cli
                   Separate multiple values with spaces, commas, or flags
  --skill <name>   Operate only on the named skills; accepts multiple values
  --project        Use the current directory instead of the global scope
  --all            Preselect all skills, including previously excluded ones
  --yes, -y        Apply saved selections without prompts; never override conflicts
  --dry-run        Preview without changing targets, config, or install records
  --remote         With list: scan available skills in the source repository
  --help, -h       Show help
  --version, -v    Show version

Defaults: global | Codex + Claude Code | source: boltguo/skills

Examples:
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
      if (!count) throw new Error(`${arg} requires a value`);
    } else expanded.push(arg);
  }
  const { values, positionals } = parseArgs({ args: expanded, allowPositionals: true, options: {
    repo: { type: 'string' }, ref: { type: 'string' }, agent: { type: 'string', multiple: true }, skill: { type: 'string', multiple: true },
    project: { type: 'boolean' }, all: { type: 'boolean' }, yes: { type: 'boolean', short: 'y' }, 'dry-run': { type: 'boolean' },
    remote: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
  } });
  if (positionals.length > 1) throw new Error('Use --skill to specify skill names.');
  const command = positionals[0];
  if (command && !['install', 'update', 'list', 'remove', 'config'].includes(command)) throw new Error(`Unknown command: ${command}`);
  if (values.agent) {
    values.agent = [...new Set(values.agent.flatMap((v) => v.split(',')))];
    for (const a of values.agent) if (!Object.hasOwn(AGENTS, a)) throw new Error(`Unknown agent: ${a}. Choose from: ${Object.keys(AGENTS).join(', ')}`);
  }
  if (values.skill) values.skill = [...new Set(values.skill.flatMap((v) => v.split(',')))];
  if (values.all && values.skill) throw new Error('Cannot use --all and --skill together.');
  if (values.remote && command !== 'list') throw new Error('--remote is only supported by list.');
  if (command === 'config' && (values.skill || values.all)) throw new Error('config does not accept --skill or --all.');
  if (command === 'remove' && (values.repo || values.ref)) throw new Error('remove uses installation records and does not accept --repo or --ref.');
  return { command, ...values, dryRun: values['dry-run'] };
}

const interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);
const prompting = (opts) => !opts.yes && !opts.dryRun;
const scope = (ctx) => ctx.project ? `Project (${ctx.base})` : `Global (${ctx.base})`;

function requireTTY(opts) {
  if (prompting(opts) && !interactive()) throw new Error('Use --yes in a noninteractive terminal, or --dry-run to preview the plan.');
}

function configure(config, opts) {
  const next = structuredClone(config);
  next.repo = normalizeRepo(opts.repo ?? config.repo);
  if (next.repo !== normalizeRepo(config.repo)) next.excluded = [];
  if (opts.ref !== undefined) next.ref = opts.ref === 'default' ? null : opts.ref;
  if (next.ref !== null && (!next.ref || next.ref.startsWith('-'))) throw new Error('The branch or tag must not be empty or start with a hyphen.');
  if (opts.agent) next.agents = opts.agent;
  return next;
}

async function chooseAgents(agents) {
  return checkbox({
    message: 'Select target tools (Space to toggle, a to toggle all, Enter to continue)',
    choices: Object.entries(AGENTS).map(([value, a]) => ({ name: a.label, value, checked: agents.includes(value) })),
    validate: (values) => values.length > 0 || 'Select at least one tool.',
    loop: false,
  });
}

function header(ctx, config) {
  console.log(`\nSource  ${config.repo}${config.ref ? ` (${config.ref})` : ''}\nScope   ${scope(ctx)}`);
  for (const { root } of targets(ctx, config.agents)) console.log(`Target  ${root}`);
}

async function sync(ctx, opts) {
  requireTTY(opts);
  const initial = await readConfig(ctx);
  const config = configure(initial, opts);
  const state = await readState(ctx);
  header(ctx, config);
  console.log('Fetching repository...');
  const repo = await checkout(config.repo, config.ref);
  try {
    const skills = await discover(repo.dir);
    // Validate the whole repository before making changes anywhere.
    const contents = new Map();
    for (const skill of skills) contents.set(skill.name, await snapshot(skill.dir));
    const names = new Set(skills.map((s) => s.name));
    if (opts.skill) for (const name of opts.skill) if (!names.has(name)) throw new Error(`Skill not found in repository: ${name}`);
    const candidates = opts.skill ? skills.filter((s) => opts.skill.includes(s.name)) : skills;
    const defaultSelected = candidates.filter((s) => opts.all || opts.skill || !config.excluded.includes(s.name)).map((s) => s.name);
    const status = (skill) => {
      const records = targets(ctx, config.agents).map(({ agent }) => state.installs[recordKey(ctx, agent, skill.name)]).filter(Boolean);
      if (config.excluded.includes(skill.name) && !opts.all && !opts.skill) return 'Previously excluded';
      if (!records.length) return 'New';
      if (records.some((r) => r.repo !== config.repo)) return 'Source conflict';
      if (records.length < targets(ctx, config.agents).length) return 'Missing from some targets';
      return records.some((r) => !sameFiles(r.files, contents.get(skill.name))) ? 'Update available' : 'Unchanged';
    };
    const selected = prompting(opts) ? await checkbox({
      message: `${opts.command === 'update' ? 'Select skills to update or add' : 'Select skills to install'} (Space to toggle, a to toggle all)`,
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
    const labels = { install: 'Install', update: 'Update', unchanged: 'Unchanged', conflict: 'Conflict, skipped' };
    console.log(`\n${opts.dryRun ? 'Preview' : 'Install plan'} | ${repo.commit.slice(0, 12)}`);
    for (const p of plans) console.log(`  ${labels[p.action]}  ${p.skill.name} -> ${p.dest}${p.reason ? `\n    ${p.reason}` : ''}`);
    if (!plans.length) console.log('  No skills selected; existing installations will be kept.');
    const missing = [...new Set(Object.values(state.installs).filter((r) => r.repo === config.repo && !names.has(r.name)).map((r) => r.name))];
    if (missing.length) console.log(`  Removed upstream, kept locally: ${missing.join(', ')} (use remove to uninstall)`);
    if (opts.dryRun) {
      console.log('\nPreview only. Targets, config, and installation records were not changed.');
      if (plans.some((p) => p.action === 'conflict')) process.exitCode = 1;
      return;
    }
    if (prompting(opts) && !await confirm({ message: `Apply this plan and save selections? Unchecked installed skills will keep their current versions.`, default: true })) {
      console.log('Cancelled. Installations and config were not changed.'); return;
    }
    await writeJSON(ctx, ctx.configFile, config);
    const counts = { install: 0, update: 0, unchanged: 0, failed: 0 };
    for (const plan of plans) {
      if (plan.action === 'conflict') { counts.failed++; continue; }
      try { await applyInstall(ctx, plan, config, state, repo.commit); counts[plan.action]++; }
      catch (e) { console.error(`  Failed ${plan.skill.name} -> ${plan.dest}: ${e.message}`); counts.failed++; }
    }
    console.log(`\nDone (per target): installed ${counts.install}, updated ${counts.update}, unchanged ${counts.unchanged}, conflicts/failed ${counts.failed}.`);
    if (counts.failed) process.exitCode = 1;
  } finally { await repo.cleanup(); }
}

async function list(ctx, opts) {
  const config = configure(await readConfig(ctx), opts);
  const state = await readState(ctx);
  console.log(`Scope   ${scope(ctx)}`);
  if (opts.remote) {
    console.log(`Source  ${config.repo}`);
    const repo = await checkout(config.repo, config.ref);
    try {
      for (const skill of await discover(repo.dir)) console.log(`${config.excluded.includes(skill.name) ? '[ ]' : '[x]'} ${skill.name}\n  ${skill.description}`);
    } finally { await repo.cleanup(); }
    return;
  }
  const records = Object.values(state.installs).filter((r) => (!opts.skill || opts.skill.includes(r.name)) && (!opts.agent || opts.agent.some((a) => recordKey(ctx, a, r.name) === recordKey(ctx, r.agent, r.name))));
  if (!records.length) { console.log('No managed installations yet. Run skilljet install to get started.'); return; }
  for (const r of records) console.log(`${r.name}  ${r.commit.slice(0, 12)}${config.excluded.includes(r.name) && r.repo === config.repo ? '  [Excluded from updates]' : ''}\n  ${r.repo}\n  ${targetRoot(ctx, r.agent)}/${r.name}`);
}

async function configCommand(ctx, opts) {
  let config = configure(await readConfig(ctx), opts);
  if (opts.repo === undefined && opts.ref === undefined && !opts.agent && prompting(opts)) {
    requireTTY(opts);
    const repo = await input({ message: 'Skill repository', default: config.repo, validate: (value) => { try { normalizeRepo(value); return true; } catch (e) { return e.message; } } });
    const ref = await input({ message: 'Branch or tag (default follows the remote default branch)', default: config.ref || 'default' });
    config = configure(config, { repo, ref, agent: await chooseAgents(config.agents) });
  }
  header(ctx, config);
  if (opts.dryRun) { console.log('Preview only. Config was not saved.'); return; }
  await writeJSON(ctx, ctx.configFile, config);
  console.log(`Config saved: ${ctx.configFile}\nChanging targets does not remove previous installations. Run install or update to apply.`);
}

async function remove(ctx, opts) {
  requireTTY(opts);
  const state = await readState(ctx);
  const config = configure(await readConfig(ctx), {});
  const entries = Object.entries(state.installs).filter(([, r]) => (!opts.skill || opts.skill.includes(r.name)) && (!opts.agent || opts.agent.some((a) => recordKey(ctx, a, r.name) === recordKey(ctx, r.agent, r.name))));
  if (opts.skill) for (const name of opts.skill) if (!entries.some(([, r]) => r.name === name)) throw new Error(`No managed installation for this skill in the selected scope: ${name}`);
  if (!entries.length) { console.log('No managed skills to uninstall.'); return; }
  if (!prompting(opts) && !opts.all && !opts.skill) throw new Error('Noninteractive removal requires an explicit --skill or --all.');
  const selected = prompting(opts) ? await checkbox({
    message: 'Select skills to uninstall (only managed files will be removed)',
    choices: entries.map(([key, r]) => ({ name: `${r.name} -> ${targetRoot(ctx, r.agent)}`, value: key, checked: Boolean(opts.all || opts.skill) })), loop: false,
  }) : entries.map(([key]) => key);
  if (!selected.length) { console.log('No skills selected. Nothing changed.'); return; }
  console.log(`Scope   ${scope(ctx)}`);
  for (const key of selected) console.log(`  Remove ${key}`);
  if (prompting(opts) && !await confirm({ message: 'Uninstall these skills? Local edits will cause conflicts; generated files will be kept.', default: false })) return;
  const removed = [];
  for (const key of selected) {
    const record = state.installs[key];
    try { await removeInstall(ctx, key, state, opts.dryRun); removed.push(record); }
    catch (e) { console.error(`Conflict/failed: ${e.message}`); process.exitCode = 1; }
  }
  if (!opts.dryRun) {
    const excluded = new Set(config.excluded);
    for (const r of removed) {
      if (r.repo === config.repo && !Object.values(state.installs).some((item) => item.name === r.name && item.repo === r.repo)) excluded.add(r.name);
    }
    config.excluded = [...excluded].sort();
    await writeJSON(ctx, ctx.configFile, config);
  }
  console.log(opts.dryRun ? 'Preview only. Nothing was uninstalled.' : `Removed managed skills from ${removed.length} target directories.`);
}

export async function main(argv = process.argv.slice(2)) {
  const opts = options(argv);
  if (opts.help) { console.log(HELP); return; }
  if (opts.version) { console.log(JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')).version); return; }
  if (!opts.command) {
    requireTTY({});
    opts.command = await select({ message: 'skilljet | Global by default', choices: [
      { name: 'Install skills', value: 'install' }, { name: 'Update skills', value: 'update' }, { name: 'List installed skills', value: 'list' },
      { name: 'Configure repository and tools', value: 'config' }, { name: 'Remove skills', value: 'remove' },
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
