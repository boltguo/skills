# Lyrics markup (JIZURA)

One line = one phrase. Everything below is optional; plain lyrics work as they are.

| Markup | Effect |
| --- | --- |
| `夜の信号が/青に変わる` | `/` splits the line into cuts (one cut per piece) |
| `*まだ*消えない光` | `*…*` emphasis: bigger, high-impact layouts are favored |
| `ほどけた声を/もう一度!` | `!` at the end of a line adds a flash + shake |
| `歌詞\|注釈` | text after `\|` becomes the small annotation in annotation layouts |
| `[01:23.45]歌詞` | LRC timestamp: the line starts at that time |
| `[間奏 8]` | 8 s interlude: no lyric, only background / decor / effects (title + artist appear if ≥ 6 s). Without a number: 4 s. `[interlude 8]` `[间奏 8]` `[간주 8]` also work |
| blank line | a short pause between sections |
| `# comment` | ignored |
| `[ti:Title]` `[ar:Artist]` | title / artist (shown in long interludes and some HUD layouts) |

## Timing

Each line's start time comes from, in priority:

1. its LRC tag `[mm:ss.xx]`
2. otherwise an estimate from the line length (≈ 0.8 s + 0.17 s per character, 1.3–5.2 s), squeezed in before the next tagged line

With `--audio`, the song's beats are detected and cut changes snap to them, and the video lasts as long as the song. Beat detection does **not** know when each line is sung: for lyrics that land on the vocals, provide an LRC file (or LRC tags on some lines; untagged lines are spread between them).

## Preparing lyrics well

- Lines of 4–14 characters (CJK) or 2–6 words (Latin) read best. Split longer lines with `/` at a natural phrase break.
- Emphasis on 1–2 key words per section, not every line — overused, it loses its effect.
- `!` on the hook or the climax line only.
- Mark instrumental sections with `[間奏 N]` so the timeline matches the song.
- Keep the lyric text itself unchanged; markup only.

Supported scripts: Japanese, Chinese (Traditional / Simplified), Korean and Latin. The language is detected automatically and picks matching fonts.
