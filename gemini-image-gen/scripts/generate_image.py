#!/usr/bin/env python3
"""
Gemini Image Generation Script
Calls the Gemini API (via AI Studio key) to generate images,
saves them along with a prompt.md to a timestamped folder.
"""

import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime

DEFAULT_MODEL = "gemini-nano-banana-2.1"
VALID_MODELS = [DEFAULT_MODEL]

SUPPORTED_ASPECT_RATIOS = [
    "1:1", "1:4", "1:8", "2:3", "3:2", "3:4",
    "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9",
]

SUPPORTED_IMAGE_SIZES = ["1K", "2K", "4K"]

SUPPORTED_THINKING_LEVELS = ["MINIMAL", "MEDIUM", "HIGH"]

MAX_REFERENCE_IMAGES = 14

MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".gif": "image/gif",
}


def sanitize_for_folder(text, max_len=50):
    """Create a filesystem-safe folder name snippet from prompt text."""
    text = text.strip()[:max_len]
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = text.strip('-').lower()
    return text or 'image'


def load_image_part(image_path):
    """Read a local image file and return an inlineData part dict for the Gemini API."""
    if not os.path.isfile(image_path):
        print(f"Error: Reference image not found: '{image_path}'", file=sys.stderr)
        sys.exit(1)

    ext = os.path.splitext(image_path)[1].lower()
    mime_type = MIME_BY_EXT.get(ext) or mimetypes.guess_type(image_path)[0] or "image/png"
    if not mime_type.startswith("image/"):
        print(f"Error: Unsupported reference image format '{image_path}' ({mime_type})", file=sys.stderr)
        sys.exit(1)

    with open(image_path, "rb") as f:
        b64_data = base64.b64encode(f.read()).decode("utf-8")

    return {
        "inlineData": {
            "mimeType": mime_type,
            "data": b64_data,
        }
    }


def build_payload(prompt, aspect_ratio, image_size, thinking_level, ref_images=None):
    """Build the API request payload for gemini-nano-banana-2.1."""
    image_config = {
        "aspectRatio": aspect_ratio,
        "imageSize": image_size,
    }

    generation_config = {
        "responseModalities": ["IMAGE"],
        "imageConfig": image_config,
        "thinkingConfig": {
            "thinkingLevel": thinking_level,
        },
    }

    parts = [{"text": prompt}]
    for img_path in (ref_images or []):
        parts.append(load_image_part(img_path))

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": generation_config,
        "tools": [{
            "googleSearch": {
                "searchTypes": {
                    "webSearch": {},
                    "imageSearch": {},
                }
            }
        }],
    }

    return payload


def call_gemini_api(prompt, api_key, model, aspect_ratio, image_size, thinking_level, ref_images=None):
    """Call the Gemini generateContent endpoint and return the parsed JSON."""
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )

    payload = build_payload(prompt, aspect_ratio, image_size, thinking_level, ref_images=ref_images)

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"API Error ({e.code}): {body}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Connection Error: {e.reason}", file=sys.stderr)
        sys.exit(1)


def extract_and_save(result, output_dir, prompt, model, aspect_ratio, image_size, thinking_level, ref_images=None):
    """Extract images and text from API response, write files to output_dir."""
    os.makedirs(output_dir, exist_ok=True)

    images_saved = []
    response_texts = []
    img_idx = 0

    for candidate in result.get("candidates", []):
        parts = candidate.get("content", {}).get("parts", [])
        for part in parts:
            if part.get("thought"):
                continue
            if "text" in part:
                response_texts.append(part["text"])
            elif "inlineData" in part:
                mime = part["inlineData"].get("mimeType", "image/png")
                ext = "png" if "png" in mime else "jpg"
                img_bytes = base64.b64decode(part["inlineData"]["data"])

                fname = f"image.{ext}" if img_idx == 0 else f"image_{img_idx}.{ext}"
                with open(os.path.join(output_dir, fname), "wb") as f:
                    f.write(img_bytes)
                images_saved.append(fname)
                img_idx += 1

    # Write prompt.md
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        "# Gemini Image Generation",
        "",
        "## Parameters",
        "",
        f"- **Model**: `{model}`",
        f"- **Aspect Ratio**: {aspect_ratio}",
        f"- **Image Size**: {image_size}",
        f"- **Thinking Level**: {thinking_level}",
    ]
    if ref_images:
        lines.append(f"- **Reference Images** ({len(ref_images)}): {', '.join(f'`{p}`' for p in ref_images)}")
    lines += [
        f"- **Generated At**: {now}",
        "",
        "## Prompt",
        "",
        prompt,
        "",
    ]

    if response_texts:
        lines += ["## Model Response", "", *response_texts, ""]

    if images_saved:
        lines += ["## Generated Images", ""]
        for img in images_saved:
            lines += [f"![{img}](./{img})", ""]

    with open(os.path.join(output_dir, "prompt.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return images_saved, response_texts


def main():
    parser = argparse.ArgumentParser(description="Generate images with the Gemini API (Nano Banana 2.1)")
    parser.add_argument("prompt", help="Image generation prompt")
    parser.add_argument(
        "--model", default=DEFAULT_MODEL,
        help=f"Model ID (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--aspect-ratio", default="16:9",
        help=f"Aspect ratio (default: 16:9). Options: {', '.join(SUPPORTED_ASPECT_RATIOS)}",
    )
    parser.add_argument(
        "--image-size", default="2K",
        help=f"Image resolution (default: 2K). Options: {', '.join(SUPPORTED_IMAGE_SIZES)}",
    )
    parser.add_argument(
        "--thinking-level", default="HIGH",
        help=f"Thinking level (default: HIGH). Options: {', '.join(SUPPORTED_THINKING_LEVELS)}",
    )
    parser.add_argument(
        "-i", "--image", action="extend", nargs="+", default=[], metavar="PATH",
        help=f"Reference image path(s) for image editing or multi-image fusion (up to {MAX_REFERENCE_IMAGES} images)",
    )
    parser.add_argument(
        "--output-dir", default=None,
        help="Output directory (auto-generated if omitted)",
    )
    parser.add_argument(
        "--save-request", action="store_true",
        help="Save response.json (Gemini API response) to output folder",
    )
    args = parser.parse_args()

    # Resolve API key from environment
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print(
            "Error: API key not found in environment variables.\n"
            "Please set one of the following:\n"
            "  export GEMINI_API_KEY=\"your-key-here\"\n"
            "  export GOOGLE_API_KEY=\"your-key-here\"\n"
            "Get your key from: https://aistudio.google.com/apikey",
            file=sys.stderr,
        )
        sys.exit(1)

    # Validate model name
    if args.model not in VALID_MODELS:
        print(
            f"Error: Unknown model '{args.model}'.\n"
            f"Supported model: {', '.join(VALID_MODELS)}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Validate reference images count
    if len(args.image) > MAX_REFERENCE_IMAGES:
        print(
            f"Error: Too many reference images ({len(args.image)}). "
            f"{args.model} supports up to {MAX_REFERENCE_IMAGES} reference images.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Validate aspect ratio
    if args.aspect_ratio not in SUPPORTED_ASPECT_RATIOS:
        print(
            f"Warning: '{args.aspect_ratio}' is not supported by {args.model}. "
            f"Supported: {', '.join(SUPPORTED_ASPECT_RATIOS)}. Falling back to 16:9.",
            file=sys.stderr,
        )
        args.aspect_ratio = "16:9"

    # Validate image size
    if args.image_size not in SUPPORTED_IMAGE_SIZES:
        fallback = "1K" if args.image_size == "512" else "2K"
        print(
            f"Warning: '{args.image_size}' is not supported by {args.model}. "
            f"Supported: {', '.join(SUPPORTED_IMAGE_SIZES)}. Falling back to {fallback}.",
            file=sys.stderr,
        )
        args.image_size = fallback

    # Validate thinking level
    args.thinking_level = args.thinking_level.upper()
    if args.thinking_level not in SUPPORTED_THINKING_LEVELS:
        print(
            f"Warning: '{args.thinking_level}' is not a valid thinking level for {args.model}. "
            f"Supported: {', '.join(SUPPORTED_THINKING_LEVELS)}. Falling back to HIGH.",
            file=sys.stderr,
        )
        args.thinking_level = "HIGH"

    # Determine output directory: gemini-images/<timestamp>-<topic>/
    output_dir = args.output_dir
    if not output_dir:
        parent = os.path.join(os.getcwd(), "gemini-images")
        os.makedirs(parent, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d%H%M%S")
        slug = sanitize_for_folder(args.prompt)
        output_dir = os.path.join(parent, f"{ts}-{slug}")

    print(f"Generating image with {args.model}...", file=sys.stderr)
    result = call_gemini_api(
        prompt=args.prompt,
        api_key=api_key,
        model=args.model,
        aspect_ratio=args.aspect_ratio,
        image_size=args.image_size,
        thinking_level=args.thinking_level,
        ref_images=args.image,
    )

    images, texts = extract_and_save(
        result, output_dir, args.prompt,
        args.model, args.aspect_ratio, args.image_size, args.thinking_level,
        ref_images=args.image,
    )

    # Determine actual success based on whether images were generated
    success = len(images) > 0
    if not success:
        print(
            "Warning: No images were generated. The request may have been "
            "blocked by safety filters or returned text-only.",
            file=sys.stderr,
        )

    output = {
        "success": success,
        "output_dir": output_dir,
        "images": images,
        "prompt_md": os.path.join(output_dir, "prompt.md"),
        "response_text": "\n".join(texts),
    }

    if args.save_request:
        response_json_path = os.path.join(output_dir, "response.json")
        with open(response_json_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        output["response_json"] = response_json_path
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
