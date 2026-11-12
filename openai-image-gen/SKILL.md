---
name: openai-image-gen
description: "Generate and edit images through the OpenAI Images API using the global OPENAI_API_KEY. Use for OpenAI API 生图、改图, flare/sunburst model controls, consistent character views, or continuing an established OpenAI API image workflow. Does not select Gemini or replace an explicitly requested built-in image tool."
---

# OpenAI Image Generation

Use the bundled script for the user's OpenAI API image workflow. It reads the global `OPENAI_API_KEY`, generates PNGs, and saves the exact prompt and request metadata alongside each image.

## Run

Use Python 3.9+ with `openai` installed. If needed, create an isolated virtual environment and install `scripts/requirements.txt`; do not copy an existing virtual environment into the skill.

```bash
python <skill-path>/scripts/generate_image.py "图片描述"
python <skill-path>/scripts/generate_image.py --prompt-file /absolute/path/prompt.txt --size 1024x1024
python <skill-path>/scripts/generate_image.py "保持人物和服饰，转为严格侧面" --image /absolute/path/front.png --model sunburst
```

Defaults: **flare → `gpt-image-2.6-flare`**, **1536×864 (16:9)**, **medium** quality, one PNG. `sunburst` resolves to `gpt-image-2.6-sunburst`. These aliases have no date suffix. An explicit complete model ID is passed through unchanged, including `gpt-image-2.5-flare` or `gpt-image-2.5-sunburst` when requested; do not silently upgrade a named model.

| Parameter | Behavior |
| --- | --- |
| `--model` | `flare` (default), `sunburst`, or an exact model ID |
| `--size` | Exact `WIDTHxHEIGHT`, or `auto`; default `1536x864` |
| `--quality` | `low`, `medium` (default), `high`, `xhigh`, `max`, `auto` |
| `--complexity` | Optional `low`, `medium`, `high` for GPT Image 2.6; separate from rendering quality |
| `-i`, `--image` | One or more local reference paths; repeatable, up to 16 total |
| `--no-reference` | Explicit text-only generation; cannot be combined with `--image` |
| `--prompt-file` | Read the exact UTF-8 prompt from a file instead of the positional prompt |
| `--output-dir` | Destination for this run; default `./openai-images/<timestamp>-<topic>/` |
| `--timeout` | Per-request timeout in seconds; default 180 |
| `--max-retries` | SDK retries; default 1, allowed 0–2; no additional retry loop |
| `--dry-run` | Validate and print a request summary without a key, API call, or output files |

An output directory contains `image.png`, `prompt.md`, `request.json`, and `result.json`. Standard output is one JSON result with absolute paths. Progress goes to standard error. Existing output files are preserved; choose a new directory for another attempt. `result.json` reports the actual pixel dimensions and whether they match the request.

## Credentials

Read `OPENAI_API_KEY` from the process environment only. The script has no key argument, `.env` loader, or credential file. Do not print environment contents, put a key in the prompt/command, or copy credentials into this repository.

On this user's macOS setup, the global key may only be loaded by interactive zsh. If the current process cannot see it, use the existing shell configuration without exposing its contents:

```bash
zsh -ic 'exec "$@"' openai-image-gen /absolute/path/to/python /absolute/path/to/skill/scripts/generate_image.py --prompt-file /absolute/path/prompt.txt --size 1024x1024
```

Use an available configured key before asking the user to change setup. Report missing configuration without requesting the secret in chat. A restricted key needs the Images endpoint permission; a Models-list permission is unnecessary for generation. Do not require a models-list probe before every run.

## Workflow

1. Resolve the subject, exact visible text, requested aspect ratio/resolution, and whether reference images are allowed. Preserve explicit user choices. Use the common sizes below when mapping natural-language requests.
2. Write a complete prompt. Keep constraints specific to this image. For clean artwork, distinguish smooth skin/fabric/shadow surfaces from intentional effects: use layered flowing light, water, volumetric dust and localized directional sparks rather than blanket grain or uniform particle scatter. Preserve rich effects when the user only wants cleaner surface textures. Do not impose this look when the user requests grain or textured painting.
3. Choose the operation deliberately: **no `--image` means `images.generate()`**, while **passing `--image` means `images.edit()`**. When the user says “不要参考图 / 从头生成”, pass `--no-reference`; do not upload earlier outputs. For edits, state what may change and what must remain fixed. Read [references/multiview.md](references/multiview.md) only for character turnaround/modeling views.
4. Run once with the selected model. The CLI makes at most the configured retries. If it still fails, report the sanitized error and completed outputs. Do not stack repeated retries, regenerate successful views, or change model/provider silently. A timeout may have reached the server; check for saved output before another attempt.
5. Inspect the actual saved image, including requested text, hands/feet, angle and visual consistency. Check actual dimensions in `result.json`. Correct a demonstrated issue within the user's scope, with a focused prompt. Retain prior versions. The script never resizes an image to conceal a size mismatch.
6. Show the result inline with an absolute image path and link the output folder or image. Report the API model and whether it was generated from text or edited with references. Provide the saved prompt. For a set, deliver all separate PNGs with clear view names; a contact sheet and ZIP are useful companions.

## Common sizes

The pixel dimensions are authoritative; map the user's ratio and resolution together.

| Request | Size |
| --- | --- |
| Default 16:9 | `1536x864` |
| 1K, 1:1 | `1024x1024` |
| 2K, 16:9 / 9:16 | `2048x1152` / `1152x2048` |
| 2K, 3:4 / 4:3 | `1536x2048` / `2048x1536` |
| 2K, 1:1 | `2048x2048` |
| 4K, 16:9 / 9:16 | `3840x2160` / `2160x3840` |

The CLI validates the documented raster range used here: edges divisible by 16, longest edge at most 3840, ratio at most 3:1, and 655,360–8,294,400 total pixels. Do not silently substitute an invalid size. Other models may have different limits; verify official documentation before broadening the supported range.

## Official OpenAI documentation

Defaults were checked on 2026-11-12. Preserve the user's explicit model, and consult these official sources when availability or parameters need verification:

- [Image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [GPT Image 2.6 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare)
- [GPT Image 2.6 Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst)
- [Python Images API reference](https://developers.openai.com/api/reference/python/resources/images/methods/generate)
