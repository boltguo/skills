---
name: lyric-video
description: "Turn lyrics (plus an optional song) into an animated lyric motion video (文字PV / lyric video / kinetic typography) and export MP4, alpha MOV or PNG frames, using the JIZURA engine in headless Chromium. Use when the user asks to make a lyric video, 歌词视频, 歌词动画, 文字PV, リリックビデオ, kinetic typography from lyrics, or to export lyrics as a video with beat sync."
metadata:
  version: "1.0.0"
  engine: "JIZURA v0.10.1 (MIT)"
---

# Lyric Video

```bash
node <skill-path>/scripts/render.mjs lyrics.txt --audio song.mp3
```

Output: `lyric-videos/{timestamp}-{slug}/` containing `video.mp4`, `project.json` (the full look, reusable), `cuts.json` (every cut's text, time and techniques). A JSON summary is printed on stdout; progress on stderr.

The engine lays out every cut from ~860 small parts (layouts, enter / hold / exit motion, decor, text treatments, backgrounds, camera, screen effects, transitions) and 27 styles. A seed picks the combination, so each seed is a different video.

## Requirements

- Node.js 18.3+ and `ffmpeg` on PATH
- Playwright with Chromium, installed once next to the script:

```bash
npm install --prefix <skill-path>/scripts && npx --prefix <skill-path>/scripts playwright install chromium
```

  (An existing global Playwright is found too. A system Chrome works with `--chrome PATH` or `CHROME_PATH`.)
- Network for Google Fonts on first use (offline, the system's CJK fonts are used instead).

First-time permission setup:

```bash
claude config add permissions.allow "Bash(node */lyric-video/scripts/render.mjs*)"
```

## Lyrics come from the user

Use only lyrics the user provides (pasted text, a .txt or an .lrc file). If the user names a published song without giving its lyrics, ask them to paste the lyrics or give the file; do not write out an existing song's lyrics from memory. Rights to the lyrics and the song stay with their owners; rights to the output video belong to the user who made it.

## Options

| Flag | Values | Default |
| --- | --- | --- |
| `--audio FILE` | any format ffmpeg reads | none: timing estimated from line length |
| `--preview` | contact sheet only (`preview.jpg`, one frame per cut) | off |
| `--format` | `mp4` (H.264 + AAC) · `mov` (ProRes 4444) · `png` (frame sequence + `audio.wav`) | `mp4` |
| `--transparent` | no background (`mov` / `png` only) | off |
| `--key-bg` | `green` · `black` (white text and effects only, for compositing) | off |
| `--aspect` | `16:9` `9:16` `4:3` `3:4` `1:1` `4:5` `21:9` | `16:9` |
| `--res` | short side: `720` `1080` `1440` `2160` | `1080` |
| `--fps` | `24` `30` `60` | `24` |
| `--theme` | `lyricpv` `kinetic` `wa` `horror` `pop` `ballad` | any |
| `--style` | style key, see [references/styles.md](references/styles.md) | from the roll |
| `--seed N` | the look and the cut plan | random (reported) |
| `--plain` | skip the random look; JIZURA defaults (`noir`) | off |
| `--parts` | `extra,wa,typo,kinetic,horror` subsets | `extra,wa,typo,kinetic` |
| `--fx k=v,…` | `motion` `glitch` `chroma` `decor` `density` `texture` `bgSwitch` (0–1) | from the roll |
| `--project FILE` | reuse a `project.json` (same look); other flags still override | — |
| `--title` `--artist` | shown in long interludes | from `[ti:]` `[ar:]` |
| `--start S --end S` | render only this time range | whole song |
| `--crf N` | H.264 quality | `18` |
| `--workers N` | parallel renderers | up to 4 |
| `--share` | also write `video_share.mp4` (CRF 26, ≤ 8 Mbps; ~5× smaller) | off |
| `--out-dir DIR` | output folder | auto |

Lyrics markup (`/` cut split, `*emphasis*`, `!` flash, `[間奏 8]` interlude, LRC tags): [references/lyrics-syntax.md](references/lyrics-syntax.md).

## Workflow

**IMPORTANT:**

- You MUST use `AskUserQuestion` tool (not plain text) to collect user input. Plain text does NOT pause execution.
- Match the user's language for all UI text (questions, labels, descriptions).

### Step 1: Lyrics and song

- Get the lyrics from the user (see above). Save them as `lyrics.txt` (or use their `.lrc` as is).
- Note the song file path if they have one.
- Song but no LRC timestamps → tell the user that cuts will snap to the beat but line starts are estimated, so lines may not land on the vocals. Offer: an LRC file, or `[mm:ss.xx]` tags on a few key lines (untagged lines are spread between them).
- LRC from another source (a music platform, another edit of the song) → check it fits this audio: preview a few seconds around the first line with `--start` / `--end`, or compare the first tag with where the intro ends. An LRC made for another version shifts every line.

### Step 2: Mark up

Read [references/lyrics-syntax.md](references/lyrics-syntax.md) and add markup without changing the words:

- `/` in lines longer than ~14 CJK characters / 6 words, at a phrase break
- `*…*` on 1–2 key words per section; `!` on the hook or climax line
- `[間奏 N]` for instrumental sections when the song has them (from LRC gaps or the user). With LRC, put it untagged right after the line before a long gap (> ~8 s) with N ≈ the gap minus that line's length, and one after the last line to cover the outro up to the end of the song; otherwise those stretches show nothing
- `[ti:…]` `[ar:…]` if the user gave title / artist

Show the marked-up lyrics briefly so the user can correct them.

### Step 3: Settings

Call `AskUserQuestion` with these questions in a single call (first option = default, Recommended):

1. **Ratio** — header: "Ratio", options: "16:9 (Recommended)" / "9:16 vertical" / "1:1" / "4:5"
2. **Look** — header: "Look", options: the theme that fits the song best (see the table at the end of [references/styles.md](references/styles.md)) marked Recommended / "Random" / one or two other themes. For a short-video platform (抖音, TikTok, Reels, Shorts), recommend 9:16 in the Ratio question
3. **Quality** — header: "Quality", options: "1080p 24fps (Recommended)" / "720p 24fps (faster)" / "1080p 30fps" / "4K 24fps (slow)"
4. **Format** — header: "Format", options: "MP4 with song (Recommended)" / "Green screen MP4" / "Transparent MOV (ProRes 4444)" / "PNG sequence"

### Step 4: Preview

```bash
node <skill-path>/scripts/render.mjs lyrics.txt [--audio song.mp3] --preview --theme T --aspect A [--seed N]
```

Read and show `preview.jpg`. Report the seed, style and mood from the summary. A thumbnail taken mid-transition can look nearly empty; that is normal.

Ask (with `AskUserQuestion`) whether to render this look, roll another seed, switch theme / style, or adjust effects (`--fx`). Repeat previews until the user picks one. A preview takes seconds; a full render takes minutes.

### Step 5: Render

Reuse the chosen preview's look exactly:

```bash
node <skill-path>/scripts/render.mjs lyrics.txt [--audio song.mp3] --project <preview-dir>/project.json --res R --fps F [--format …] [--key-bg …]
```

Speed is roughly 15 frames/s at 1080p on 4 cores (a 4-minute song at 24 fps ≈ 6–7 minutes; 4K ≈ 4× slower). For long songs, tell the user the estimate first; to check something quickly, render a slice with `--start` / `--end`.

Run long renders in the background and wait for them to finish.

### Step 6: Results

1. Report the video path, duration, resolution, seed and style. A full song at CRF 18 can be 200 MB+; render with `--share` when the user will send or upload it
2. Mention `project.json`: pass it back with `--project` to re-render the same look — another resolution or format gives the identical video; another ratio keeps style, timing and cuts while layouts adapt to the new frame
3. On `success: false`, read `error` and see below

## Error Handling

| Error | Cause | Fix |
| --- | --- | --- |
| `playwright not found` | Playwright not installed | run the install command in Requirements |
| `could not start Chromium` | browser not downloaded | `npx playwright install chromium`, or `--chrome PATH` |
| `ffmpeg not found` | ffmpeg missing | install ffmpeg |
| `unknown style` | typo in `--style` | use a key from references/styles.md |
| `--transparent needs --format mov or png` | MP4 has no alpha | use `--format mov` or `--key-bg green` |
| fonts look generic | Google Fonts unreachable | check network; install Noto CJK fonts for offline |

## Credits

Engine: [JIZURA 字面](https://github.com/852wa/JIZURA) by hakoniwa, MIT License (`vendor/LICENSE.JIZURA`). The bundle in `vendor/` is the engine without the editor UI; rebuild it from a newer checkout with `python3 scripts/build_engine.py /path/to/JIZURA`.
