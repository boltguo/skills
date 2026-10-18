---
name: gemini-image-gen
description: "Generate images using the Gemini API (AI Studio key). Use when user asks to generate/create images with Gemini, Google AI, or mentions '图片生成', 'Gemini 生图', 'AI 生图', 'generate image', 'create image'."
---

# Gemini Image Generation

```bash
python <skill-path>/scripts/generate_image.py "your prompt here"
```

Output: `gemini-images/{timestamp}-{slug}/` containing `prompt.md`, `image.png`, and optionally `response.json`.

## Requirements

`GEMINI_API_KEY` or `GOOGLE_API_KEY` env var ([get key](https://aistudio.google.com/apikey)).

First-time permission setup:

```bash
claude config add permissions.allow "Bash(python */gemini-image-gen/scripts/generate_image.py*)"
```

## Model

| Model                    | Notes                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gemini-nano-banana-2.1` | **Default (Nano Banana 2.1).** Image-only output (`responseModalities: ["IMAGE"]`), `thinkingConfig` (`HIGH` default), Google Web/Image Search grounding, up to 14 ref images |

## Parameters

### `--image-size`

Must use **uppercase `K`**. Unsupported values are caught by the script and fall back (`512`→`1K`, others→`2K`).

| Value | Supported | Notes                                |
| ----- | --------- | ------------------------------------ |
| `1K`  | Yes       | Fast preview / standard resolution   |
| `2K`  | Yes       | **Default.** Balanced quality & size |
| `4K`  | Yes       | Ultra-high resolution                |

### `--aspect-ratio`

Supports **14 aspect ratios** (including ultra-wide and panoramic ratios with fixed tiling at `2K`/`4K`):

`1:1` · `1:4` · `1:8` · `2:3` · `3:2` · `3:4` · `4:1` · `4:3` · `4:5` · `5:4` · `8:1` · `9:16` · `16:9` (default) · `21:9`

Unsupported ratio auto-falls back to `16:9`.

### `--thinking-level`

Controls the reasoning depth before generating the final image (case-insensitive):

| Value     | Notes                                                            |
| --------- | ---------------------------------------------------------------- |
| `HIGH`    | **Default.** Maximum reasoning for complex layouts and prompts   |
| `MEDIUM`  | Balanced composition reasoning & speed                           |
| `MINIMAL` | Fastest latency, minimal interim reasoning                       |

Unsupported level auto-falls back to `HIGH`.

### `-i` / `--image` (Reference Images)

Pass up to **14 local reference images** (`.png`, `.jpg`/`.jpeg`, `.webp`, `.heic`, `.heif`, `.gif`) for image editing, sketch-to-image, character consistency (up to 4 characters), or multi-object fusion (up to 10 objects):

```bash
python <skill-path>/scripts/generate_image.py "prompt" -i ref1.png ref2.jpg
```

### Other flags

- `--save-request`: Save `response.json` (Gemini API response) to output folder
- `--output-dir`: Override auto-generated output path

## Usage

1. **Craft the prompt**: Refine the user's request into a clear, detailed prompt (English works best, or match user's text requirements if rendering specific text in the image).
2. **Run the script**: Call `generate_image.py` directly using the defaults (`2K`, `16:9`, `HIGH` thinking), overriding flags only when requested by the user or implied by the use case (e.g., `9:16` for mobile wallpapers/posters, `-i` when reference images are provided):
   ```bash
   python <skill-path>/scripts/generate_image.py "prompt" [--aspect-ratio ...] [--image-size ...] [--thinking-level ...] [-i ref1.png ...] [--save-request]
   ```
3. **Return results**: Show the generated image and report the output folder path (or inform the user if `success: false`).

## Prompt Tips

- Style: "oil painting", "3D render", "watercolor", "photorealistic"
- Lighting: "golden hour", "dramatic rim lighting", "soft diffused"
- Composition: "bird's eye view", "close-up", "wide establishing shot"
- Mood: "mysterious", "cheerful", "melancholic", "epic"
- Text in images: 25 characters or fewer

## Error Handling

| Error            | Cause                                                    | Fix                                         |
| ---------------- | -------------------------------------------------------- | ------------------------------------------- |
| `400`            | Invalid parameter                                        | Check supported values for the chosen model |
| `401/403`        | Bad API key                                              | Check env var                               |
| `429`            | Rate limit                                               | Wait and retry                              |
| `success: false` | No image generated (safety filter or text-only response) | Adjust prompt                               |
