#!/usr/bin/env python3
"""Generate/edit PNG images with OpenAI using the global OPENAI_API_KEY."""

import argparse
import base64
import json
import math
import os
import re
import struct
import sys
import time
from contextlib import ExitStack
from datetime import datetime
from pathlib import Path


MODEL_ALIASES = {
    "flare": "gpt-image-2.6-flare",
    "sunburst": "gpt-image-2.6-sunburst",
}
DEFAULT_SIZE = "1536x864"
OUTPUT_NAMES = ("image.png", "prompt.md", "request.json", "result.json")


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def redact(message, key):
    message = str(message)
    if key:
        message = message.replace(key, "[REDACTED]")
    return re.sub(r"sk-[A-Za-z0-9_-]{12,}", "[REDACTED]", message)


def valid_size(value):
    if value == "auto":
        return value
    match = re.fullmatch(r"([1-9]\d*)x([1-9]\d*)", value)
    if not match:
        raise argparse.ArgumentTypeError("尺寸应为 WIDTHxHEIGHT 或 auto")
    width, height = map(int, match.groups())
    if width % 16 or height % 16:
        raise argparse.ArgumentTypeError("宽和高必须为 16 的倍数")
    if max(width, height) > 3840 or max(width, height) > 3 * min(width, height):
        raise argparse.ArgumentTypeError("最长边不能超过 3840，长短边比例不能超过 3:1")
    if not 655_360 <= width * height <= 8_294_400:
        raise argparse.ArgumentTypeError("总像素数必须在 655360 至 8294400 之间")
    return value


def positive_timeout(value):
    seconds = float(value)
    if not math.isfinite(seconds) or seconds <= 0:
        raise argparse.ArgumentTypeError("timeout 必须是有限的正数")
    return seconds


def png_dimensions(data):
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("接口没有返回有效的 PNG 图片数据")
    width, height = struct.unpack(">II", data[16:24])
    if not width or not height:
        raise ValueError("PNG 尺寸无效")
    return width, height


def write_json(path, data):
    with path.open("x", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prompt", nargs="?", help="图片描述；与 --prompt-file 二选一")
    parser.add_argument("--prompt-file", type=Path, help="UTF-8 提示词文件")
    parser.add_argument("--model", default="flare", help="flare、sunburst 或完整模型 ID")
    parser.add_argument("--size", type=valid_size, default=DEFAULT_SIZE)
    parser.add_argument("--quality", choices=["low", "medium", "high", "xhigh", "max", "auto"], default="medium")
    parser.add_argument("--complexity", choices=["low", "medium", "high"], help="GPT Image 2.6 构图规划复杂度")
    refs = parser.add_mutually_exclusive_group()
    refs.add_argument("-i", "--image", action="extend", nargs="+", type=Path, default=[], metavar="PATH", help="参考图片，最多16张")
    refs.add_argument("--no-reference", action="store_true", help="仅文字生成，禁止参考图片")
    parser.add_argument("--output-dir", type=Path, help="本次输出目录；默认 ./openai-images/<timestamp>-<topic>/")
    parser.add_argument("--timeout", type=positive_timeout, default=180.0)
    parser.add_argument("--max-retries", type=int, choices=[0, 1, 2], default=1)
    parser.add_argument("--dry-run", action="store_true", help="仅验证参数，不读取密钥、不请求API、不创建文件")
    return parser


def prepare(args):
    if args.prompt_file and args.prompt is not None:
        raise ValueError("请在 prompt 和 --prompt-file 之间选择一个")
    prompt = args.prompt_file.expanduser().read_text(encoding="utf-8") if args.prompt_file else args.prompt
    if not prompt or not prompt.strip():
        raise ValueError("请提供非空图片描述或 --prompt-file")
    if len(args.image) > 16:
        raise ValueError("最多支持 16 张参考图片")
    images = [path.expanduser().resolve() for path in args.image]
    for path in images:
        if not path.is_file():
            raise ValueError(f"参考图片不存在：{path}")
        if path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            raise ValueError(f"参考图片需为 PNG、JPEG 或 WebP：{path}")
    model = MODEL_ALIASES.get(args.model, args.model).strip()
    if not model:
        raise ValueError("模型 ID 不能为空")
    if args.complexity and not model.startswith("gpt-image-2.6-"):
        raise ValueError("--complexity 当前仅用于 GPT Image 2.6；请为其他模型省略此参数")
    slug = re.sub(r"[^\w-]+", "-", prompt.strip(), flags=re.UNICODE).strip("-_")[:36] or "image"
    output_dir = (args.output_dir.expanduser() if args.output_dir else Path.cwd() / "openai-images" / f"{datetime.now():%Y%m%d-%H%M%S-%f}-{slug}").resolve()
    if output_dir.exists() and not output_dir.is_dir():
        raise ValueError(f"输出路径不是文件夹：{output_dir}")
    if any((output_dir / name).exists() for name in OUTPUT_NAMES):
        raise ValueError(f"输出文件已存在，请为本次运行选择新目录：{output_dir}")
    request = {"model": model, "prompt": prompt, "size": args.size, "quality": args.quality, "n": 1, "output_format": "png"}
    if args.complexity:
        # extra_body also works with SDK versions that predate this API field.
        request["extra_body"] = {"complexity": args.complexity}
    plan = {"operation": "edit" if images else "generate", "model": model, "size": args.size,
            "quality": args.quality, "complexity": args.complexity, "output_format": "png",
            "reference_images": [str(path) for path in images], "output_dir": str(output_dir),
            "timeout": args.timeout, "max_retries": args.max_retries}
    return prompt, images, output_dir, request, plan


def main(argv=None):
    args = build_parser().parse_args(argv)
    key = ""
    output_dir = None
    started = time.monotonic()
    try:
        prompt, images, destination, request, plan = prepare(args)
        if args.dry_run:
            emit({"success": True, "dry_run": True, **plan})
            return 0
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not key:
            raise ValueError("全局环境变量 OPENAI_API_KEY 未设置。请在本地配置环境变量，不要把密钥贴到聊天中。")
        try:
            from openai import OpenAI
        except ImportError:
            raise RuntimeError("缺少 openai 依赖，请在虚拟环境中安装 scripts/requirements.txt") from None
        destination.mkdir(parents=True, exist_ok=True)
        # Claim the run without overwriting an existing prompt, even on a collision.
        with (destination / "prompt.md").open("x", encoding="utf-8") as file:
            file.write(prompt)
        output_dir = destination
        write_json(output_dir / "request.json", plan)
        print(f"{plan['operation']}: {plan['model']}，{args.size}，{args.quality}……", file=sys.stderr, flush=True)
        with OpenAI(api_key=key, timeout=args.timeout, max_retries=args.max_retries) as client:
            with ExitStack() as stack:
                if images:
                    files = [stack.enter_context(path.open("rb")) for path in images]
                    response = client.images.edit(image=files, **request)
                else:
                    response = client.images.generate(**request)
        if not response.data or not response.data[0].b64_json:
            raise ValueError("接口未返回图片数据")
        data = base64.b64decode(response.data[0].b64_json, validate=True)
        width, height = png_dimensions(data)
        image_path = output_dir / "image.png"
        with image_path.open("xb") as file:
            file.write(data)
        matches = args.size == "auto" or args.size == f"{width}x{height}"
        result = {"success": matches, **plan, "images": [str(image_path)],
                  "actual_size": f"{width}x{height}", "size_matches_request": matches,
                  "elapsed_seconds": round(time.monotonic() - started, 2)}
        usage = getattr(response, "usage", None)
        if usage is not None and hasattr(usage, "model_dump"):
            result["usage"] = usage.model_dump(mode="json")
        revised_prompt = getattr(response.data[0], "revised_prompt", None)
        if revised_prompt:
            result["revised_prompt"] = revised_prompt
        if not matches:
            result["error"] = "返回尺寸与请求不一致；已保留图片供检查，没有自动缩放。"
        write_json(output_dir / "result.json", result)
        emit(result)
        return 0 if matches else 1
    except Exception as exc:
        result = {"success": False, "error": redact(exc, key), "error_type": type(exc).__name__,
                  "status_code": getattr(exc, "status_code", None)}
        if output_dir is not None:
            result["output_dir"] = str(output_dir)
            path = output_dir / "result.json"
            if not path.exists():
                try:
                    write_json(path, result)
                except OSError:
                    pass
        emit(result)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
