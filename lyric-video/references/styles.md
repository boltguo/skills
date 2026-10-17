# Looks: themes, moods, styles

By default every run rolls a coherent random look from `--seed` (JIZURA's おまかせ): a mood, a style, effect strengths, a subset of techniques, fonts and colors. `--theme` narrows the roll, `--style` pins the palette, `--plain` skips the roll.

## Themes (`--theme`)

| Key | Name | Rolls among moods | Character |
| --- | --- | --- | --- |
| `lyricpv` | 文字PV (lyric PV) | editorial, graphic, emotional | typography-led: big type, rules, numbers, vertical setting |
| `kinetic` | キネティック (kinetic) | pop, graphic, glitch | word-by-word motion locked to the beat |
| `wa` | 和風 (Japanese) | calm, emotional, editorial | lanterns, shoji, fans, family crests, sakura |
| `horror` | ホラー | horror | flicker, static, surveillance monitors (no gore) |
| `pop` | ポップ | pop | bright, bouncy, decorated |
| `ballad` | バラード | calm, emotional | slow, smooth motion (no on-twos stepping) |

Without `--theme`, any mood can come up (horror only when `--parts` includes `horror`).

## Moods (picked by the roll; shown in the run summary)

`glitch` グリッチ · `calm` しっとり · `pop` ポップ · `graphic` グラフィック · `editorial` エディトリアル · `emotional` エモーショナル · `horror` ホラー · `chaos` 全部入り (everything)

## Styles (`--style`)

Palette, fonts and texture. One video switches between the style's background schemes cut by cut.

| Key | Name | Fits |
| --- | --- | --- |
| `noir` | Noir Chroma | dark, glitch, emotional (JIZURA default) |
| `crimson` | Crimson Signal | dark red, intense, glitch |
| `caution` | Caution | yellow/black, graphic, pop |
| `magenta` | Pop Magenta | pop |
| `paper` | Paper Ink | calm, editorial |
| `hud` | Dark HUD | sci-fi, calm, editorial |
| `mint` | Mint Terminal | terminal, glitch, graphic |
| `specimen` | Specimen | type specimen, calm, editorial |
| `transit` | Transit | signage, pop, graphic |
| `blueprint` | Blueprint | technical, graphic |
| `rouge` | Rouge Gradient | pop, graphic |
| `mono` | Mono RGB | monochrome, glitch, editorial |
| `sakura` | Sakura | Japanese, soft (wa) |
| `ocean` | Deep Sea | blue, calm, emotional |
| `sunset` | Sunset Gradient | warm, emotional |
| `forest` | Forest Notebook | green, calm |
| `vapor` | Vapor | vaporwave, pop |
| `newsprint` | Newsprint | newspaper, editorial |
| `synth80` | Synth 80s | retro synthwave |
| `kraft` | Kraft Paper | handmade, warm |
| `candy` | Candy | sweet, pop |
| `acid` | Acid | loud, glitch |
| `sumi` | Ink & Vermilion | Japanese, brush (wa) |
| `gold` | Gold Night | elegant, night |
| `hrRuin` | Ruins | horror only |
| `hrNightRec` | Night Recording | horror only |
| `hrCurse` | Cursed Letter | horror only |

`sakura` … `gold` belong to the added set (`extra`, on by default); `sakura` and `sumi` also need `wa`; `hr*` need `horror`. An explicit `--style` is always honored.

## Part sets (`--parts`)

Which technique sets random picks may use. Default `extra,wa,typo,kinetic`.

| Set | Contents |
| --- | --- |
| `extra` | parts and styles added after JIZURA's first release |
| `wa` | Japanese motifs and styles |
| `typo` | lyric-PV typography parts (rules, numbers, ruby, brackets…) |
| `kinetic` | word-by-word kinetic parts, beat-synced when a song is given |
| `horror` | horror parts and palettes; enables the horror mood |

## Effect sliders (`--fx`)

`k=v` pairs, 0–1, applied after the roll: `motion` (movement strength), `glitch`, `chroma` (color split), `decor` (amount of decoration), `density` (how finely lines are cut), `texture` (grain/paper), `bgSwitch` (how often the background scheme changes). Example: `--fx motion=0.9,glitch=0.1`.

## Picking a look for a song

| Song feel | Try |
| --- | --- |
| upbeat, idol, dance | `--theme kinetic` or `--theme pop` |
| rock, electronic, intense | no theme, or `--style noir` / `crimson` / `acid` |
| ballad, acoustic | `--theme ballad`, style `paper` / `ocean` / `sunset` |
| Japanese traditional, wa-pop | `--theme wa` |
| vocaloid / lyric PV | `--theme lyricpv` |
| eerie, dark | `--theme horror` (turns the horror set on by itself) |

Same seed + same lyrics + same flags = the same plan. To keep a look you liked, pass its `project.json` back with `--project`.
