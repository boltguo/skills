#!/usr/bin/env node
// Render a lyric motion video with the JIZURA engine in headless Chromium, encode with ffmpeg.
// Lyrics (+ optional song) -> MP4 / alpha MOV / PNG frames, or a preview contact sheet.
// Prints a JSON summary on stdout; progress goes to stderr.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(HERE, '..', 'vendor', 'jizura-engine.js');
const ASPECTS = ['16:9', '9:16', '4:3', '3:4', '1:1', '4:5', '21:9'];
const THEMES = ['lyricpv', 'kinetic', 'wa', 'horror', 'pop', 'ballad'];
const PARTS = ['extra', 'wa', 'typo', 'kinetic', 'horror'];
const USAGE = `usage: node render.mjs LYRICS_FILE [options]

  --audio FILE          song (any format ffmpeg reads): beat sync + soundtrack
  --preview             only a contact sheet (one frame per cut) + cuts.json, no video
  --format mp4|mov|png  mp4 (H.264, default) | mov (ProRes 4444 with alpha) | png (frame sequence)
  --transparent         no background (mov / png only)
  --key-bg green|black  green screen / black background with white text
  --aspect A            ${ASPECTS.join(' | ')} (default 16:9)
  --res N               short side in px: 720 | 1080 | 1440 | 2160 (default 1080)
  --fps N               24 | 30 | 60 (default 24)
  --theme T             ${THEMES.join(' | ')}
  --style KEY           a style key (see references/styles.md)
  --seed N              random look + cut plan (default: random)
  --plain               skip the randomized look (omakase); use JIZURA defaults
  --parts LIST          part sets for random picks (default extra,wa,typo,kinetic; add horror)
  --fx k=v,...          effect sliders 0..1: motion glitch chroma decor density texture bgSwitch
  --project FILE        reuse a project.json from an earlier run (same look; lyrics/flags still apply)
  --title T --artist A  shown during long interludes
  --start S --end S     render only this time range (seconds)
  --crf N               H.264 quality (default 18, lower = better)
  --workers N           parallel renderers (default: up to 4)
  --out-dir DIR         output folder (default lyric-videos/<timestamp>-<slug>/)
  --chrome PATH         Chrome / Chromium executable (or set CHROME_PATH)`;

const { values: A, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    audio: { type: 'string' }, preview: { type: 'boolean' }, format: { type: 'string', default: 'mp4' },
    transparent: { type: 'boolean' }, 'key-bg': { type: 'string' },
    aspect: { type: 'string' }, res: { type: 'string' }, fps: { type: 'string' },
    theme: { type: 'string' }, style: { type: 'string' }, seed: { type: 'string' }, plain: { type: 'boolean' },
    parts: { type: 'string' }, fx: { type: 'string' }, project: { type: 'string' },
    title: { type: 'string' }, artist: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' },
    crf: { type: 'string', default: '18' }, workers: { type: 'string' }, 'out-dir': { type: 'string' },
    chrome: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  },
});
const fail = msg => { process.stderr.write(`error: ${msg}\n`); process.exit(1); };
const log = msg => process.stderr.write(msg + '\n');
if (A.help || positionals.length !== 1) { log(USAGE); process.exit(A.help ? 0 : 1); }

// ---------- validate ----------
const lyricsPath = path.resolve(positionals[0]);
if (!fs.existsSync(lyricsPath)) fail(`lyrics file not found: ${lyricsPath}`);
if (!fs.existsSync(ENGINE)) fail(`engine bundle missing: ${ENGINE}`);
const format = A.format;
if (!['mp4', 'mov', 'png'].includes(format)) fail(`--format must be mp4, mov or png`);
if (A.transparent && format === 'mp4') fail('--transparent needs --format mov or png (MP4 has no alpha)');
if (A.transparent && A['key-bg']) fail('use either --transparent or --key-bg');
if (A['key-bg'] && !['green', 'black'].includes(A['key-bg'])) fail('--key-bg must be green or black');
if (A.aspect && !ASPECTS.includes(A.aspect)) fail(`--aspect must be one of ${ASPECTS.join(', ')}`);
if (A.theme && !THEMES.includes(A.theme)) fail(`--theme must be one of ${THEMES.join(', ')}`);
if (A.audio && !fs.existsSync(A.audio)) fail(`audio file not found: ${A.audio}`);
const num = (v, name) => { if (v == null) return undefined; const n = Number(v); if (!Number.isFinite(n)) fail(`${name} must be a number`); return n; };
const res = num(A.res, '--res'), fps = num(A.fps, '--fps'), seed = num(A.seed, '--seed');
const start = num(A.start, '--start'), end = num(A.end, '--end'), crf = num(A.crf, '--crf');
if (fps != null && ![24, 30, 60].includes(fps)) fail('--fps must be 24, 30 or 60');
if (res != null && (res < 240 || res > 2160)) fail('--res must be between 240 and 2160');
const parts = (A.parts ?? 'extra,wa,typo,kinetic').split(',').map(s => s.trim()).filter(Boolean);
for (const p of parts) if (!PARTS.includes(p)) fail(`unknown part set "${p}" (${PARTS.join(', ')})`);
const fx = {};
for (const kv of (A.fx || '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('='); const n = Number(v);
  if (!k || !Number.isFinite(n)) fail(`bad --fx entry "${kv}"`);
  fx[k.trim()] = Math.max(0, Math.min(1, n));
}
const needFfmpeg = !A.preview && (format !== 'png' || A.audio);
const has = cmd => { try { execFileSync(cmd, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } };
if ((needFfmpeg || A.audio) && !has('ffmpeg')) fail('ffmpeg not found on PATH (install it: brew install ffmpeg / apt install ffmpeg)');

// ---------- output folder ----------
const lyrics = fs.readFileSync(lyricsPath, 'utf8');
const slug = (s => s.replace(/\[[^\]]*\]/g, '').replace(/[\\/:*?"<>|\s*!#]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'lyrics')(
  lyrics.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#') && !/^\[(ti|ar|al|by|offset):/i.test(l)) || '');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const outDir = path.resolve(A['out-dir'] || path.join('lyric-videos', `${stamp}-${slug}`));
fs.mkdirSync(outDir, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyric-video-'));
const cleanup = () => fs.rmSync(tmpDir, { recursive: true, force: true });
process.on('exit', cleanup);

const run = (cmd, args) => new Promise((ok, ko) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
  p.stderr.on('data', d => { err += d; });
  p.on('close', c => (c === 0 ? ok() : ko(new Error(`${cmd} exited ${c}: ${err.slice(-800)}`))));
});

// the song as plain WAV: every Chromium build can decode it
let wav = null;
if (A.audio) {
  wav = path.join(tmpDir, 'audio.wav');
  await run('ffmpeg', ['-y', '-v', 'error', '-i', path.resolve(A.audio), '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', wav]);
}

// ---------- local server: page + engine + song ----------
const PAGE = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script src="/engine.js"></script><script src="/driver.js"></script></body></html>';
const server = http.createServer((req, res) => {
  const send = (type, body) => { res.writeHead(200, { 'content-type': type }); res.end(body); };
  if (req.url === '/') return send('text/html; charset=utf-8', PAGE);
  if (req.url === '/engine.js') return send('text/javascript; charset=utf-8', fs.readFileSync(ENGINE));
  if (req.url === '/driver.js') return send('text/javascript; charset=utf-8', `(${driver})();`);
  if (req.url === '/audio.wav' && wav) return send('audio/wav', fs.readFileSync(wav));
  res.writeHead(404); res.end();
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}/`;

// runs inside the page
function driver() {
  const HUD = '0123456789:./-_()【】・No.LYRICRECUNTITLEDXYlinebpminterlude—─／ ';
  const S = {};
  const timeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  window.JZ = {
    async analyze(name) {
      const blob = await (await fetch('/audio.wav')).blob();
      const a = await J.analyzeAudio(new File([blob], name, { type: 'audio/wav' }));
      return { duration: a.duration, bpm: a.bpm, beats: Array.from(a.beats), energy: Array.from(a.energy), energyRate: a.energyRate };
    },
    // project: build it (cfg.base = a saved project.json, else defaults + omakase) and return it
    build(cfg) {
      const base = J.defaultProject();
      let p;
      if (cfg.base) {
        p = Object.assign(base, cfg.base);
        p.fx = Object.assign(J.defaultProject().fx, cfg.base.fx || {});
      } else {
        p = base;
        for (const k of ['extra', 'wa', 'typo', 'kinetic', 'horror']) p[k] = cfg.parts.includes(k);
        if (cfg.theme) p.themeId = cfg.theme;
        if (!cfg.plain) Object.assign(p, J.omakase(p, J.rng(cfg.seed), cfg.theme || null));
        p.seed = cfg.seed;
      }
      if (cfg.style) {
        if (!J.STYLES[cfg.style]) throw new Error(`unknown style "${cfg.style}" — one of ${J.STYLE_ORDER.join(', ')}`);
        p.style = cfg.style;
        if (p.colors) p.colors.accentOn = false;
      }
      p.lyrics = cfg.lyrics;
      for (const k of ['aspect', 'res', 'fps', 'title', 'artist']) if (cfg[k] != null) p[k] = cfg[k];
      if (cfg.keyBg) p.keyBg = cfg.keyBg;
      p.fx = Object.assign({}, p.fx, cfg.fx);
      if (cfg.audio) p.timing = Object.assign({}, p.timing, { snap: true });
      return p;
    },
    async setup(project, audio) {
      S.plan = J.plan(project, audio);
      await timeout(J.ensureFonts(project.lyrics + (project.title || '') + (project.artist || '') + HUD, J.fontsOfPlan(S.plan)).catch(() => null), 20000);
      S.R = new J.Renderer();
      const P = S.plan;
      [S.w, S.h] = J.outputSize(project);                 // the plan is laid out at design size, drawn scaled
      S.scale = S.w / P.W;
      J.glyphs.maxRes = S.h >= 1000 ? 768 : 512;           // glyph cache resolution, as the app's own export
      return {
        W: S.w, H: S.h, fps: P.fps, duration: P.duration, style: P.styleKey, mood: project.mood || null,
        cuts: P.cuts.map(c => ({ text: c.text, start: +c.start.toFixed(3), end: +c.end.toFixed(3), layout: c.layout, enter: c.enter, hold: c.hold, exit: c.exit,
          decor: (c.decor || []).map(d => d.id), treat: c.treat, bg: c.bg, cam: c.cam, trans: c.trans })),
      };
    },
    // frames [from, to) (frame numbers from the start of the song) as base64 JPEG, or PNG (opts.png)
    frames(from, to, opts) {
      const P = S.plan, c = S.c || (S.c = document.createElement('canvas'));
      c.width = S.w; c.height = S.h;
      const ctx = c.getContext('2d', { alpha: !!opts.transparent });
      const out = [];
      for (let i = from; i < to; i++) {
        if (opts.transparent) ctx.clearRect(0, 0, S.w, S.h);
        S.R.frame(ctx, P, i / P.fps, { scale: S.scale, transparent: !!opts.transparent });
        out.push(c.toDataURL(opts.png ? 'image/png' : 'image/jpeg', 0.95).split(',')[1]);
      }
      return out;
    },
    // one frame from the middle of each cut, tiled, with time + layout labels
    sheet(t0, t1) {
      const P = S.plan, cuts = P.cuts.filter(c => c.end > t0 && c.start < t1);
      const cols = Math.min(4, Math.max(1, cuts.length)), tw = P.W >= P.H ? 480 : 270, th = Math.round(tw * P.H / P.W), lab = 22;
      const rows = Math.ceil(cuts.length / cols);
      const sheet = document.createElement('canvas'); sheet.width = cols * tw; sheet.height = rows * (th + lab);
      const sx = sheet.getContext('2d'); sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
      const c = document.createElement('canvas'); c.width = tw; c.height = th; const ctx = c.getContext('2d');
      cuts.forEach((cut, i) => {
        const inD = cut.inDur || 0, outD = cut.outDur || 0;
        const t = Math.min(cut.end - 0.01, cut.start + inD + Math.max(0, cut.end - cut.start - inD - outD) * 0.5);
        S.R.frame(ctx, P, t, { scale: tw / P.W });
        const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + lab);
        sx.drawImage(c, x, y);
        sx.fillStyle = '#ddd'; sx.font = '13px monospace';
        sx.fillText(`#${i + 1} ${t.toFixed(1)}s ${cut.layout}/${cut.enter}`.slice(0, Math.floor(tw / 8)), x + 6, y + th + 15);
      });
      return sheet.toDataURL('image/jpeg', 0.9).split(',')[1];
    },
  };
}

// ---------- browser ----------
async function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const paths = [HERE, process.cwd(), ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)];
  try { paths.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch {}
  for (const name of ['playwright', 'playwright-core']) {
    try { const m = await import(pathToFileURL(req.resolve(name, { paths })).href); return m.chromium || m.default.chromium; } catch {}
  }
  fail(`playwright not found. Install it next to the script: npm install --prefix "${HERE}" playwright && npx --prefix "${HERE}" playwright install chromium`);
}
const chromium = await loadPlaywright();
const executablePath = A.chrome || process.env.CHROME_PATH || undefined;
let browser;
try { browser = await chromium.launch({ executablePath }); }
catch (e) { fail(`could not start Chromium (${e.message.split('\n')[0]}). Run "npx playwright install chromium" or pass --chrome PATH`); }

const openPage = async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => log(`page error: ${e.message}`));
  await page.goto(origin);
  await page.waitForFunction(() => window.JZ && window.J && J.Renderer);
  return page;
};

let summary;
try {
  const main = await openPage();
  let audio = null;
  if (wav) { log('analyzing song…'); audio = await main.evaluate(n => JZ.analyze(n), path.basename(A.audio)); log(`  ${audio.duration.toFixed(1)}s, ~${audio.bpm} BPM`); }
  const base = A.project ? JSON.parse(fs.readFileSync(A.project, 'utf8')) : null;
  const cfg = {
    base, lyrics, parts, theme: A.theme || null, style: A.style || null, plain: !!A.plain,
    seed: seed ?? (base && base.seed) ?? Math.floor(Math.random() * 1e9),
    aspect: A.aspect, res, fps, title: A.title, artist: A.artist, keyBg: A['key-bg'] || null, fx, audio: !!audio,
  };
  if (!base) { cfg.aspect ??= '16:9'; cfg.res ??= 1080; cfg.fps ??= 24; }
  const project = await main.evaluate(c => JZ.build(c), cfg);
  const info = await main.evaluate(([p, a]) => JZ.setup(p, a), [project, audio]);
  fs.writeFileSync(path.join(outDir, 'project.json'), JSON.stringify(project, null, 2));
  fs.writeFileSync(path.join(outDir, 'cuts.json'), JSON.stringify(info.cuts, null, 2));
  const t0 = Math.max(0, start ?? 0), t1 = Math.min(info.duration, end ?? info.duration);
  if (!(t1 > t0)) throw new Error(`empty range ${t0}–${t1.toFixed(2)}s (video is ${info.duration.toFixed(2)}s)`);
  log(`plan: ${info.cuts.length} cuts, ${info.duration.toFixed(1)}s, ${info.W}x${info.H}@${info.fps}, style ${info.style}${info.mood ? ', mood ' + info.mood : ''}, seed ${project.seed}`);
  summary = { success: true, output_dir: outDir, project_json: path.join(outDir, 'project.json'), cuts_json: path.join(outDir, 'cuts.json'),
    seed: project.seed, style: info.style, mood: info.mood, theme: project.themeId || null, width: info.W, height: info.H, fps: info.fps,
    duration: +(t1 - t0).toFixed(2), cuts: info.cuts.length, bpm: audio ? audio.bpm : null };

  if (A.preview) {
    const b64 = await main.evaluate(([a, b]) => JZ.sheet(a, b), [t0, t1]);
    summary.preview = path.join(outDir, 'preview.jpg');
    fs.writeFileSync(summary.preview, Buffer.from(b64, 'base64'));
  } else {
    const transparent = !!A.transparent;
    const first = Math.round(t0 * info.fps), total = Math.max(1, Math.round((t1 - t0) * info.fps));
    const nWorkers = Math.max(1, Math.min(num(A.workers, '--workers') ?? Math.min(4, os.cpus().length), Math.ceil(total / (info.fps * 2))));
    const pages = [main];
    while (pages.length < nWorkers) { const p = await openPage(); await p.evaluate(([pr, a]) => JZ.setup(pr, a), [project, audio]); pages.push(p); }
    const framesDir = format === 'png' ? path.join(outDir, 'frames') : null;
    if (framesDir) fs.mkdirSync(framesDir, { recursive: true });
    const encArgs = format === 'mov'
      ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', transparent ? 'yuva444p10le' : 'yuv444p10le']
      : ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p'];
    const ext = format === 'mov' ? 'mov' : 'mp4';
    let done = 0; const began = Date.now();
    let shown = -1;
    const progress = () => {
      const pct = Math.floor(done * 10 / total);
      if (!process.stderr.isTTY && pct === shown) return;     // plain logs: one line per 10%
      shown = pct;
      const line = `rendering ${done}/${total} frames  ${(done / Math.max((Date.now() - began) / 1000, 0.001)).toFixed(1)} fps`;
      process.stderr.write(process.stderr.isTTY ? `\r${line}  ` : line + '\n');
    };
    const BATCH = 8;
    // each worker renders one contiguous span into its own segment; segments are joined without re-encoding
    const spans = Array.from({ length: nWorkers }, (_, w) => [Math.floor(total * w / nWorkers), Math.floor(total * (w + 1) / nWorkers)]);
    const segs = await Promise.all(spans.map(async ([a, b], w) => {
      const page = pages[w];
      const seg = framesDir ? null : path.join(tmpDir, `seg${w}.${ext}`);
      const ff = seg && spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(info.fps), '-i', '-', ...encArgs, seg], { stdio: ['pipe', 'ignore', 'pipe'] });
      let ffErr = ''; ff && ff.stderr.on('data', d => { ffErr += d; });
      const closed = ff && new Promise(ok => ff.on('close', ok));
      for (let i = a; i < b; i += BATCH) {
        const n = Math.min(BATCH, b - i);
        const imgs = await page.evaluate(([f, to, o]) => JZ.frames(f, to, o), [first + i, first + i + n, { transparent, png: transparent || !!framesDir }]);
        for (let k = 0; k < imgs.length; k++) {
          const buf = Buffer.from(imgs[k], 'base64');
          if (framesDir) fs.writeFileSync(path.join(framesDir, `frame_${String(i + k + 1).padStart(6, '0')}.png`), buf);
          else if (!ff.stdin.write(buf)) await new Promise(ok => ff.stdin.once('drain', ok));
        }
        done += imgs.length; progress();
      }
      if (ff) { ff.stdin.end(); const code = await closed; if (code !== 0) throw new Error(`ffmpeg (segment ${w}) failed: ${ffErr.slice(-800)}`); }
      return seg;
    }));
    if (process.stderr.isTTY) process.stderr.write('\n');
    summary.render_seconds = +((Date.now() - began) / 1000).toFixed(1);
    if (framesDir) {
      summary.frames_dir = framesDir; summary.frames = total;
      if (wav) {
        summary.audio = path.join(outDir, 'audio.wav');
        await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t0), '-t', String(t1 - t0), '-i', wav, '-c:a', 'pcm_s16le', summary.audio]);
      }
    } else {
      const list = path.join(tmpDir, 'segments.txt');
      fs.writeFileSync(list, segs.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
      const video = path.join(outDir, `video.${ext}`);
      const args = ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list];
      if (wav) args.push('-ss', String(t0), '-t', String(t1 - t0), '-i', wav, '-map', '0:v', '-map', '1:a',
        ...(format === 'mov' ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac', '-b:a', '192k']));
      args.push('-c:v', 'copy', ...(format === 'mp4' ? ['-movflags', '+faststart'] : []), video);
      await run('ffmpeg', args);
      summary.video = video;
    }
  }
} catch (e) {
  summary = { success: false, error: e.message.split('\n')[0].replace(/^page\.evaluate: (Error: )?/, ''), output_dir: outDir };
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.success ? 0 : 1);
