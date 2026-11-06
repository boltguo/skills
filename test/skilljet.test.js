import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { context, readConfig, readState, withLock } from '../src/store.js';
import { checkout, discover, normalizeRepo, snapshot } from '../src/repository.js';
import { planInstall, applyInstall } from '../src/install.js';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/skilljet.js', import.meta.url));
const put = async (file, text) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); };
const json = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const missing = async (file) => assert.rejects(fs.access(file), { code: 'ENOENT' });

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilljet-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'project');
  const repo = path.join(root, 'repo');
  await Promise.all([home, cwd, repo].map((d) => fs.mkdir(d)));
  const env = { ...process.env, HOME: home, USERPROFILE: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', NO_COLOR: '1' };
  const git = (...args) => exec('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Skilljet Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-C', repo, ...args], { env });
  await git('init', '-b', 'main');
  const skill = async (name, content = 'v1', prefix = 'skills') => {
    const dir = path.join(repo, prefix, name);
    await put(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} test skill\n---\n${content}\n`);
    return dir;
  };
  const alpha = await skill('alpha');
  await put(path.join(alpha, 'references', 'old.txt'), 'old');
  const beta = await skill('beta', 'v1', '.');
  const commit = async () => { await git('add', '.'); await git('commit', '-m', 'fixture change'); };
  await commit();
  const run = async (...args) => {
    try { const result = await exec(process.execPath, [cli, ...args], { env, cwd, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }); return { ...result, code: 0 }; }
    catch (error) { return { stdout: error.stdout, stderr: error.stderr, code: error.code }; }
  };
  const install = async (...args) => { const result = await run('install', '--repo', repo, '--yes', ...args); assert.equal(result.code, 0, result.stderr); return result; };
  const ctx = context({ home, cwd });
  const dest = (name = 'alpha', agent = '.agents', project = false) => path.join(project ? cwd : home, agent, 'skills', name);
  return { root, home, cwd, repo, env, git, skill, alpha, beta, commit, run, install, ctx, dest };
}

test('default global install includes every skill and both default agents', async (t) => {
  const f = await fixture(t);
  await f.install();
  for (const name of ['alpha', 'beta']) for (const agent of ['.agents', '.claude']) assert.match(await fs.readFile(path.join(f.dest(name, agent), 'SKILL.md'), 'utf8'), new RegExp(`name: ${name}`));
  const config = await readConfig(f.ctx);
  assert.deepEqual(config.agents, ['codex', 'claude']);
  assert.deepEqual(config.excluded, []);
  assert.equal(Object.keys((await readState(f.ctx)).installs).length, 4);
  await missing(path.join(f.cwd, '.agents'));
  const list = await f.run('list');
  assert.equal(list.code, 0);
  assert.match(list.stdout, /alpha/);
  const repeat = await f.run('update', '--yes');
  assert.equal(repeat.code, 0, repeat.stderr);
  assert.match(repeat.stdout, /unchanged 4/);
});

test('updates remove obsolete tracked files, preserve generated content and executable mode', async (t) => {
  const f = await fixture(t);
  await f.install();
  await put(path.join(f.dest(), 'outputs', 'render.txt'), 'generated');
  await put(path.join(f.dest(), 'node_modules', 'installed.txt'), 'dependency');
  const outside = path.join(f.root, 'external');
  await put(path.join(outside, 'keep.txt'), 'outside');
  await fs.symlink(outside, path.join(f.dest(), 'runtime-link'));
  await f.skill('alpha', 'v2');
  await fs.rm(path.join(f.alpha, 'references', 'old.txt'));
  await put(path.join(f.alpha, 'scripts', 'run.sh'), '#!/bin/sh\necho hello\n');
  await fs.chmod(path.join(f.alpha, 'scripts', 'run.sh'), 0o755);
  await f.commit();
  const result = await f.run('update', '--yes');
  assert.equal(result.code, 0, result.stderr);
  assert.match(await fs.readFile(path.join(f.dest(), 'SKILL.md'), 'utf8'), /v2/);
  await missing(path.join(f.dest(), 'references', 'old.txt'));
  assert.equal(await fs.readFile(path.join(f.dest(), 'outputs', 'render.txt'), 'utf8'), 'generated');
  assert.equal(await fs.readFile(path.join(f.dest(), 'node_modules', 'installed.txt'), 'utf8'), 'dependency');
  assert.equal(await fs.readlink(path.join(f.dest(), 'runtime-link')), outside);
  assert.ok((await fs.stat(path.join(f.dest(), 'scripts', 'run.sh'))).mode & 0o111);
});

test('remembered exclusions stay excluded; new skills are selected; --all restores exclusions', async (t) => {
  const f = await fixture(t);
  await f.install();
  const config = await json(f.ctx.configFile);
  config.excluded = ['beta'];
  await put(f.ctx.configFile, JSON.stringify(config));
  await f.skill('beta', 'v2', '.');
  await f.skill('gamma');
  await f.commit();
  let result = await f.run('update', '--yes');
  assert.equal(result.code, 0, result.stderr);
  assert.match(await fs.readFile(path.join(f.dest('beta'), 'SKILL.md'), 'utf8'), /v1/);
  assert.match(await fs.readFile(path.join(f.dest('gamma'), 'SKILL.md'), 'utf8'), /gamma/);
  result = await f.run('update', '--all', '--yes');
  assert.equal(result.code, 0, result.stderr);
  assert.match(await fs.readFile(path.join(f.dest('beta'), 'SKILL.md'), 'utf8'), /v2/);
  assert.deepEqual((await json(f.ctx.configFile)).excluded, []);
});

test('modified managed file conflicts even with --yes; other targets still update', async (t) => {
  const f = await fixture(t);
  await f.install();
  await put(path.join(f.dest(), 'SKILL.md'), 'my local edits');
  await f.skill('alpha', 'v2'); await f.commit();
  const result = await f.run('update', '--yes');
  assert.equal(result.code, 1);
  assert.match(result.stdout, /Local file has been modified/);
  assert.equal(await fs.readFile(path.join(f.dest(), 'SKILL.md'), 'utf8'), 'my local edits');
  assert.match(await fs.readFile(path.join(f.dest('alpha', '.claude'), 'SKILL.md'), 'utf8'), /v2/);
});

test('unmanaged same-name folders and generated file collisions are never overwritten', async (t) => {
  const f = await fixture(t);
  await put(path.join(f.dest(), 'mine.txt'), 'mine');
  let result = await f.run('install', '--repo', f.repo, '--yes');
  assert.equal(result.code, 1);
  assert.match(result.stdout, /not managed by skilljet/);
  assert.equal(await fs.readFile(path.join(f.dest(), 'mine.txt'), 'utf8'), 'mine');
  await put(path.join(f.dest('alpha', '.claude'), 'new.txt'), 'local file');
  await put(path.join(f.alpha, 'new.txt'), 'upstream file'); await f.commit();
  result = await f.run('update', '--yes');
  assert.equal(result.code, 1);
  assert.match(result.stdout, /unmanaged local content/);
  assert.equal(await fs.readFile(path.join(f.dest('alpha', '.claude'), 'new.txt'), 'utf8'), 'local file');
});

test('project inherits source, has independent choices and deduplicates shared agent targets', async (t) => {
  const f = await fixture(t);
  await f.install();
  const config = await json(f.ctx.configFile); config.excluded = ['beta']; await put(f.ctx.configFile, JSON.stringify(config));
  let result = await f.run('install', '--project', '--agent', 'codex', 'claude', 'antigravity', 'antigravity-cli', '--yes');
  assert.equal(result.code, 0, result.stderr);
  const ctx = context({ home: f.home, cwd: f.cwd, project: true });
  assert.equal(Object.keys((await readState(ctx)).installs).length, 4);
  assert.deepEqual((await readConfig(ctx)).excluded, []);
  await f.skill('alpha', 'v2'); await f.commit();
  result = await f.run('update', '--yes'); // Must remain global even inside configured project.
  assert.equal(result.code, 0, result.stderr);
  assert.match(await fs.readFile(path.join(f.dest(), 'SKILL.md'), 'utf8'), /v2/);
  assert.match(await fs.readFile(path.join(f.dest('alpha', '.agents', true), 'SKILL.md'), 'utf8'), /v1/);
  result = await f.run('update', '--project', '--yes');
  assert.equal(result.code, 0, result.stderr);
  assert.match(await fs.readFile(path.join(f.dest('alpha', '.agents', true), 'SKILL.md'), 'utf8'), /v2/);
});

test('dry-run changes neither targets nor config/state and creates no lock', async (t) => {
  const f = await fixture(t);
  let result = await f.run('install', '--repo', f.repo, '--dry-run');
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await fs.readdir(f.home), []);
  await f.install();
  const before = await fs.readFile(f.ctx.stateFile, 'utf8');
  const configBefore = await fs.readFile(f.ctx.configFile, 'utf8');
  await f.skill('alpha', 'v2'); await f.commit();
  result = await f.run('update', '--dry-run', '--agent', 'codex');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await fs.readFile(f.ctx.stateFile, 'utf8'), before);
  assert.equal(await fs.readFile(f.ctx.configFile, 'utf8'), configBefore);
  assert.match(await fs.readFile(path.join(f.dest(), 'SKILL.md'), 'utf8'), /v1/);
  await missing(path.join(f.ctx.dir, 'lock'));
});

test('selected skill filters do not exclude unrelated skills; invalid names fail', async (t) => {
  const f = await fixture(t);
  await f.install('--skill', 'alpha', '--agent', 'codex');
  await missing(f.dest('beta'));
  assert.deepEqual((await json(f.ctx.configFile)).excluded, []);
  const result = await f.run('install', '--skill', 'no-such-skill', '--yes');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Skill not found in repository/);
});

test('remove preserves generated files, remembers exclusions and refuses local edits', async (t) => {
  const f = await fixture(t);
  await f.install();
  await put(path.join(f.dest(), 'output.txt'), 'keep');
  let result = await f.run('remove', '--skill', 'alpha', '--yes');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await fs.readFile(path.join(f.dest(), 'output.txt'), 'utf8'), 'keep');
  await missing(path.join(f.dest(), 'SKILL.md'));
  await missing(f.dest('alpha', '.claude'));
  assert.deepEqual((await json(f.ctx.configFile)).excluded, ['alpha']);
  await put(path.join(f.dest('beta'), 'SKILL.md'), 'edited');
  result = await f.run('remove', '--skill', 'beta', '--yes');
  assert.equal(result.code, 1);
  assert.equal(await fs.readFile(path.join(f.dest('beta'), 'SKILL.md'), 'utf8'), 'edited');
});

test('upstream removal retains installed skill; failure to fetch leaves installation intact', async (t) => {
  const f = await fixture(t);
  await f.install();
  await fs.rm(f.alpha, { recursive: true }); await f.commit();
  let result = await f.run('update', '--yes');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Removed upstream/);
  await fs.access(path.join(f.dest(), 'SKILL.md'));
  const before = await fs.readFile(f.ctx.stateFile, 'utf8');
  result = await f.run('update', '--ref', 'missing-branch', '--yes');
  assert.equal(result.code, 1);
  assert.equal(await fs.readFile(f.ctx.stateFile, 'utf8'), before);
  assert.equal((await readConfig(f.ctx)).ref, null);
});

test('destination symlinks and symlinked managed parents cannot redirect writes', async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.root, 'outside'); await fs.mkdir(outside);
  await fs.mkdir(path.dirname(f.dest()), { recursive: true });
  await fs.symlink(outside, f.dest());
  let result = await f.run('install', '--repo', f.repo, '--yes');
  assert.equal(result.code, 1);
  assert.deepEqual(await fs.readdir(outside), []);
  await fs.rm(path.join(f.dest('alpha', '.claude'), 'references'), { recursive: true });
  await fs.symlink(outside, path.join(f.dest('alpha', '.claude'), 'references'));
  await f.skill('alpha', 'v2'); await f.commit();
  result = await f.run('update', '--yes');
  assert.equal(result.code, 1);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('discovery skips agent aliases and dependencies; invalid duplicate or unsafe metadata fails', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.repo, '.agents', 'skills'), { recursive: true });
  await fs.symlink('../../skills/alpha', path.join(f.repo, '.agents', 'skills', 'alpha'));
  await f.skill('dependency', 'v1', 'node_modules');
  assert.deepEqual((await discover(f.repo)).map((s) => s.name), ['alpha', 'beta']);
  await put(path.join(f.repo, 'duplicate', 'SKILL.md'), '---\nname: alpha\ndescription: duplicate\n---\n');
  await assert.rejects(discover(f.repo), /Duplicate skill name/);
  await fs.rm(path.join(f.repo, 'duplicate'), { recursive: true });
  await put(path.join(f.alpha, 'SKILL.md'), '---\nname: ../../escape\ndescription: unsafe\n---\n');
  await assert.rejects(discover(f.repo), /valid name/);
});

test('symbolic links inside source skills fail before any target installation', async (t) => {
  const f = await fixture(t);
  await fs.symlink('/etc/passwd', path.join(f.alpha, 'unsafe.txt')); await f.commit();
  const result = await f.run('install', '--repo', f.repo, '--yes');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /symlink/);
  await missing(path.join(f.home, '.agents'));
  await missing(f.ctx.configFile);
});

test('failed state persistence rolls back destination content', async (t) => {
  const f = await fixture(t);
  await f.install();
  await f.skill('alpha', 'v2'); await f.commit();
  const repo = await checkout(f.repo, null);
  try {
    const skill = (await discover(repo.dir)).find((s) => s.name === 'alpha');
    const state = await readState(f.ctx);
    const config = await readConfig(f.ctx);
    const plan = await planInstall(f.ctx, skill, 'codex', config, state, await snapshot(skill.dir));
    // Force the final rename of state.json to fail, after target replacement.
    await fs.rm(f.ctx.stateFile); await fs.mkdir(f.ctx.stateFile);
    await assert.rejects(applyInstall(f.ctx, plan, config, state, repo.commit));
    assert.match(await fs.readFile(path.join(f.dest(), 'SKILL.md'), 'utf8'), /v1/);
    assert.equal((await fs.readdir(path.dirname(f.dest()))).some((p) => p.includes('stage') || p.includes('backup')), false);
  } finally { await repo.cleanup(); }
});

test('scope lock rejects concurrent runs and releases after errors', async (t) => {
  const f = await fixture(t);
  await withLock(f.ctx, async () => {
    const result = await f.run('install', '--repo', f.repo, '--yes');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Another operation holds/);
  });
  await assert.rejects(withLock(f.ctx, async () => { throw new Error('test'); }), /test/);
  await missing(path.join(f.ctx.dir, 'lock'));
});

test('help, version and validation do not alter home; noninteractive mutation needs --yes', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.run('--version')).stdout.trim(), '0.1.2');
  assert.match((await f.run('--help')).stdout, /Defaults: global/);
  assert.equal((await f.run('install', '--repo', f.repo)).code, 1);
  assert.equal((await f.run('install', '--agent', 'typo', '--yes')).code, 1);
  assert.equal((await f.run('update', '--skill', 'alpha', '--all', '--yes')).code, 1);
  assert.deepEqual(await fs.readdir(f.home), []);
  assert.equal(normalizeRepo('boltguo/skills'), 'https://github.com/boltguo/skills.git');
  assert.throws(() => normalizeRepo('https://secret@example.com/repo'), /credentials/);
  assert.throws(() => normalizeRepo('--upload-pack=bad'), /Repository must be/);
});
