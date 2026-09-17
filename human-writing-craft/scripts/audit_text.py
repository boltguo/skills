#!/usr/bin/env python3
"""Surface-pattern auditor for Chinese and English prose.

This utility produces review leads, not an AI-authorship score. It deliberately
skips frontmatter, fenced code, blockquotes, Markdown tables, inline code, and
URLs. Every finding still requires contextual review before editing.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Sequence

NOTICE = (
    "Review leads only. Findings are not proof of AI authorship and must not be "
    "used as an AI percentage or automatic rewrite plan."
)


@dataclass(frozen=True)
class Finding:
    rule_id: str
    language: str
    category: str
    confidence: str
    severity: str
    line: int
    excerpt: str
    message: str
    suggestion: str


@dataclass(frozen=True)
class RegexRule:
    rule_id: str
    language: str
    category: str
    confidence: str
    severity: str
    pattern: re.Pattern[str]
    message: str
    suggestion: str


ZH_RULES: tuple[RegexRule, ...] = (
    RegexRule(
        "zh-staged-reversal",
        "zh",
        "structure",
        "high",
        "moderate",
        re.compile(
            r"(?:不是|并非|不在于|不只是|不仅仅是|你以为|看似|表面上)"
            r"[^。！？\n]{0,70}(?:而是|而在于|其实|实则|真正(?:的|重要的)?是)"
        ),
        "The sentence may stage a false alternative before revealing the claim.",
        "Check whether the first half reflects a real misconception. If not, state the supported claim directly.",
    ),
    RegexRule(
        "zh-prompt-colon",
        "zh",
        "sentence",
        "high",
        "minor",
        re.compile(
            r"(?:一句话(?:总结|讲清楚)|核心(?:是|在于)|关键(?:是|在于)|先说结论|"
            r"值得注意的是|需要指出的是|具体来说|换句话说)[：:]"
        ),
        "A meta-label announces the point instead of making it.",
        "Delete the label when the following clause stands on its own; preserve genuine definitions or quotations.",
    ),
    RegexRule(
        "zh-empty-list-intro",
        "zh",
        "structure",
        "medium",
        "minor",
        re.compile(
            r"(?:主要|具体)?(?:包括|分为|体现在|归纳为)(?:以下)?"
            r"(?:几个|几类|几点|方面|步骤|原因|问题)?[：:]"
        ),
        "The sentence may be an empty shell before a list.",
        "Keep it only when it adds a real classification or procedural condition; otherwise start with the list.",
    ),
    RegexRule(
        "zh-opening-formula",
        "zh",
        "sentence",
        "high",
        "minor",
        re.compile(r"^\s*(?:说白了|说穿了|先说结论)(?:[，,:：]|\s)"),
        "The opening uses a stock emphasis cue.",
        "State the point without the cue unless it belongs to the writer's established voice.",
    ),
    RegexRule(
        "zh-vague-attribution",
        "zh",
        "content",
        "high",
        "major",
        re.compile(
            r"(?:有研究表明|研究表明|专家(?:指出|认为|表示)|业内人士(?:指出|认为|表示)|"
            r"据统计|数据显示|大量用户(?:反馈|表示)|普遍认为)"
        ),
        "The claim relies on an unnamed or potentially unverifiable source.",
        "Name the source, remove the attribution if the claim stands alone, or mark the claim for verification.",
    ),
    RegexRule(
        "zh-chatbot-wrapper",
        "zh",
        "presentation",
        "high",
        "minor",
        re.compile(
            r"(?:^\s*当然可以[！!，,。.]?|^\s*以下是(?:为你|给你)?|"
            r"希望以上(?:内容|信息)?(?:能|对你)|如需进一步|让我来(?:为你)?(?:解释|介绍))"
        ),
        "Chat interaction residue may remain in a standalone artifact.",
        "Remove it unless the target genre is an actual conversation or service reply.",
    ),
    RegexRule(
        "zh-redundant-gloss",
        "zh",
        "sentence",
        "medium",
        "minor",
        re.compile(r"(?:这意味着|这表明|这说明)(?:了|[，,])"),
        "The sentence may restate the preceding fact as an abstract conclusion.",
        "Keep it only if it adds a supported consequence or inference; otherwise delete or specify the consequence.",
    ),
    RegexRule(
        "zh-topic-shell",
        "zh",
        "translationese",
        "medium",
        "minor",
        re.compile(r"(?:对于[^，。！？\n]{2,18}(?:来说|而言)|在[^，。！？\n]{2,15}方面)[，,]"),
        "A fronted topic shell may delay the real subject and action.",
        "Move the actor or action earlier when that makes the sentence clearer; preserve the shell when it carries contrast or scope.",
    ),
    RegexRule(
        "zh-idealized-role",
        "zh",
        "content",
        "high",
        "moderate",
        re.compile(
            r"(?:永不疲倦|不知疲倦|贴心|智慧|全能|忠实)(?:的)?"
            r"(?:助手|导师|专家|审查员|伙伴|守护者)"
        ),
        "An idealized role substitutes personality for actual capability and limits.",
        "Describe what the system does, when it does it, and what still requires human judgment.",
    ),
    RegexRule(
        "zh-empty-elevation",
        "zh",
        "content",
        "medium",
        "moderate",
        re.compile(r"(?:里程碑式(?:的)?意义|开启(?:了)?新篇章|时代浪潮|深刻变革|未来可期|前景广阔|拭目以待)"),
        "The phrase may elevate ordinary information without naming a consequence.",
        "Replace it with the supported change, evidence, or remaining uncertainty; do not invent specifics.",
    ),
)

EN_RULES: tuple[RegexRule, ...] = (
    RegexRule(
        "en-staged-contrast",
        "en",
        "structure",
        "medium",
        "moderate",
        re.compile(
            r"\b(?:it|this|that)\s+(?:isn['’]t|is not|wasn['’]t|was not)\s+"
            r"[^.!?\n]{1,90}?(?:[,;:]\s*|[.!?]\s+)(?:it['’]s|it is|this is|that is)\b"
            r"|\bnot\s+(?:just|merely|simply)\b[^.!?\n]{1,90}?\bbut\b",
            re.IGNORECASE,
        ),
        "The passage may use a staged contrast to manufacture a reveal.",
        "Check whether the rejected frame is real. If not, state the supported positive claim directly.",
    ),
    RegexRule(
        "en-vague-attribution",
        "en",
        "content",
        "high",
        "major",
        re.compile(
            r"\b(?:studies show|research shows|experts (?:say|argue|believe)|"
            r"industry reports (?:show|suggest|indicate)|critics argue|observers note|"
            r"users have reported|it is widely believed)\b",
            re.IGNORECASE,
        ),
        "The claim relies on an unnamed or potentially unverifiable source.",
        "Name the source, remove the attribution if the claim stands alone, or mark it for verification.",
    ),
    RegexRule(
        "en-inflated-significance",
        "en",
        "content",
        "medium",
        "moderate",
        re.compile(
            r"\b(?:marks? a pivotal moment|serves? as a testament to|underscores? the importance of|"
            r"represents? a broader shift|stands? as a beacon|shap(?:es|ing) the evolving landscape)\b",
            re.IGNORECASE,
        ),
        "The wording claims significance without necessarily naming a concrete consequence.",
        "State what changed, for whom, and with what evidence; otherwise lower the claim.",
    ),
    RegexRule(
        "en-chatbot-wrapper",
        "en",
        "presentation",
        "high",
        "minor",
        re.compile(
            r"(?:^\s*(?:of course|certainly|great question)[!,.]?|"
            r"\bhere (?:is|are) (?:a|an|the) (?:comprehensive )?(?:overview|summary|rewrite)\b|"
            r"\bi hope this helps\b|\blet me know if you(?:'d| would) like\b)",
            re.IGNORECASE,
        ),
        "Chat interaction residue may remain in a standalone artifact.",
        "Remove it unless the target genre is an actual conversation or service reply.",
    ),
    RegexRule(
        "en-shallow-participle",
        "en",
        "sentence",
        "medium",
        "minor",
        re.compile(
            r",\s*(?:highlighting|underscoring|showcasing|reflecting|ensuring|fostering|"
            r"demonstrating)\b",
            re.IGNORECASE,
        ),
        "A participial tail may add generic analysis without evidence.",
        "Keep it only when it contributes a supported relation; otherwise cut it or state the concrete consequence.",
    ),
    RegexRule(
        "en-stock-outlook",
        "en",
        "content",
        "high",
        "moderate",
        re.compile(
            r"\b(?:the future (?:looks|is) bright|only time will tell|despite (?:these|the) challenges[^.]{0,80}continues? to thrive)\b",
            re.IGNORECASE,
        ),
        "The sentence uses a stock outlook rather than a dated plan, forecast, or open question.",
        "Replace it with supported next steps or uncertainty, or remove it.",
    ),
    RegexRule(
        "en-bold-miniheading",
        "en",
        "presentation",
        "medium",
        "minor",
        re.compile(r"^\s*[-*+]\s+\*\*[^*\n]{2,60}\*\*\s*[:—-]"),
        "A bold mini-heading bullet may be part of template-heavy formatting.",
        "Keep genuine reference lists; convert conceptual prose to sentences when the list adds no scan value.",
    ),
)

ZH_BUSINESS = {
    "赋能",
    "闭环",
    "抓手",
    "底层逻辑",
    "顶层设计",
    "深耕",
    "聚焦",
    "打造",
    "助力",
    "全方位",
    "多维度",
    "沉浸式",
    "一站式",
}

EN_CLICHES = {
    "delve",
    "leverage",
    "robust",
    "comprehensive",
    "landscape",
    "tapestry",
    "pivotal",
    "intricate",
    "seamless",
    "navigate",
    "unpack",
    "realm",
    "paradigm",
}

EN_SALES = {
    "groundbreaking",
    "cutting-edge",
    "game-changing",
    "world-class",
    "breathtaking",
    "vibrant",
    "must-visit",
    "revolutionary",
    "effortless",
}


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Flag surface writing patterns for contextual review; never produces an AI score."
    )
    parser.add_argument("file", help="Path to a UTF-8 text/Markdown file, or '-' for stdin")
    parser.add_argument("--lang", choices=("auto", "zh", "en", "both"), default="auto")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--include-low", action="store_true", help="Include low-confidence contextual leads")
    parser.add_argument("--max-findings", type=int, default=50)
    return parser.parse_args(argv)


def read_text(path_value: str) -> str:
    if path_value == "-":
        return sys.stdin.read()
    path = Path(path_value)
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise SystemExit(f"error: file not found: {path}") from exc
    except UnicodeDecodeError as exc:
        raise SystemExit(f"error: file is not valid UTF-8: {path}") from exc


def mask_inline(line: str) -> str:
    """Mask inline code and URL targets while preserving line length roughly."""

    def spaces(match: re.Match[str]) -> str:
        return " " * len(match.group(0))

    line = re.sub(r"`[^`\n]*`", spaces, line)
    line = re.sub(r"https?://[^\s)>\]]+", spaces, line)
    line = re.sub(r"(?<=\]\()[^)]+(?=\))", spaces, line)
    return line


def masked_lines(text: str) -> list[str]:
    lines = text.splitlines()
    result: list[str] = []
    in_frontmatter = bool(lines and lines[0].strip() == "---")
    in_fence = False
    fence_token = ""

    for index, raw in enumerate(lines):
        stripped = raw.lstrip()

        if in_frontmatter:
            result.append(" " * len(raw))
            if index > 0 and raw.strip() == "---":
                in_frontmatter = False
            continue

        fence_match = re.match(r"\s*(```+|~~~+)", raw)
        if fence_match:
            token = fence_match.group(1)[0]
            if not in_fence:
                in_fence = True
                fence_token = token
            elif token == fence_token:
                in_fence = False
                fence_token = ""
            result.append(" " * len(raw))
            continue

        if in_fence:
            result.append(" " * len(raw))
            continue

        if stripped.startswith(">"):
            result.append(" " * len(raw))
            continue

        # Conservative Markdown-table masking. Prose containing an isolated pipe remains visible.
        if raw.count("|") >= 2 and (stripped.startswith("|") or stripped.endswith("|")):
            result.append(" " * len(raw))
            continue

        result.append(mask_inline(raw))

    return result


def infer_languages(text: str, requested: str) -> tuple[str, ...]:
    if requested == "both":
        return ("zh", "en")
    if requested in {"zh", "en"}:
        return (requested,)

    cjk = len(re.findall(r"[\u3400-\u9fff]", text))
    latin_words = len(re.findall(r"\b[A-Za-z][A-Za-z'-]*\b", text))
    languages: list[str] = []
    if cjk >= 20:
        languages.append("zh")
    if latin_words >= 12:
        languages.append("en")
    if not languages:
        languages.append("zh" if cjk > latin_words else "en")
    return tuple(languages)


def excerpt_for(line: str, start: int, end: int, limit: int = 180) -> str:
    left = max(0, start - 45)
    right = min(len(line), end + 90)
    excerpt = line[left:right].strip()
    if left:
        excerpt = "…" + excerpt
    if right < len(line):
        excerpt += "…"
    excerpt = re.sub(r"\s+", " ", excerpt)
    return excerpt[:limit]


def scan_regex_rules(lines: list[str], languages: Iterable[str]) -> list[Finding]:
    enabled = set(languages)
    findings: list[Finding] = []
    for line_no, line in enumerate(lines, start=1):
        for rule in (*ZH_RULES, *EN_RULES):
            if rule.language not in enabled:
                continue
            for match in rule.pattern.finditer(line):
                findings.append(
                    Finding(
                        rule.rule_id,
                        rule.language,
                        rule.category,
                        rule.confidence,
                        rule.severity,
                        line_no,
                        excerpt_for(line, match.start(), match.end()),
                        rule.message,
                        rule.suggestion,
                    )
                )
    return findings


def paragraphs(lines: list[str]) -> list[tuple[int, str]]:
    result: list[tuple[int, str]] = []
    buffer: list[str] = []
    start = 1
    for line_no, line in enumerate(lines, start=1):
        if line.strip():
            if not buffer:
                start = line_no
            buffer.append(line.strip())
        elif buffer:
            result.append((start, " ".join(buffer)))
            buffer = []
    if buffer:
        result.append((start, " ".join(buffer)))
    return result


EN_TECHNICAL_EXCEPTIONS: dict[str, tuple[re.Pattern[str], ...]] = {
    "robust": (
        re.compile(r"\brobust (?:regression|standard errors?|estimator|estimation|optimization|control|statistics?)\b", re.IGNORECASE),
    ),
    "leverage": (
        re.compile(r"\b(?:financial|operating) leverage\b", re.IGNORECASE),
        re.compile(r"\bleverage ratio\b", re.IGNORECASE),
    ),
    "landscape": (
        re.compile(r"\b(?:physical|natural|urban|rural|coastal|mountain) landscape\b", re.IGNORECASE),
    ),
}


def word_forms_present(paragraph: str, words: set[str]) -> list[str]:
    lowered = paragraph.lower()
    present: list[str] = []
    for word in sorted(words):
        if not re.search(rf"\b{re.escape(word)}(?:s|ed|ing|ly)?\b", lowered):
            continue
        exceptions = EN_TECHNICAL_EXCEPTIONS.get(word, ())
        if exceptions and any(pattern.search(paragraph) for pattern in exceptions):
            continue
        present.append(word)
    return present


def scan_clusters(lines: list[str], languages: Iterable[str]) -> list[Finding]:
    enabled = set(languages)
    findings: list[Finding] = []
    for start_line, paragraph in paragraphs(lines):
        if "zh" in enabled:
            found = [term for term in sorted(ZH_BUSINESS) if term in paragraph]
            if len(set(found)) >= 2:
                findings.append(
                    Finding(
                        "zh-business-cluster",
                        "zh",
                        "sentence",
                        "medium",
                        "moderate",
                        start_line,
                        re.sub(r"\s+", " ", paragraph)[:180],
                        f"Several business abstractions cluster in one paragraph: {', '.join(found[:6])}.",
                        "Identify the actor, action, object, and result. Preserve any term that has a fixed internal meaning.",
                    )
                )

        if "en" in enabled:
            clichés = word_forms_present(paragraph, EN_CLICHES)
            if len(clichés) >= 2:
                findings.append(
                    Finding(
                        "en-cliche-cluster",
                        "en",
                        "sentence",
                        "medium",
                        "moderate",
                        start_line,
                        re.sub(r"\s+", " ", paragraph)[:180],
                        f"Several cliché-list words cluster in one paragraph: {', '.join(clichés[:6])}.",
                        "Review function and technical meaning. Replace only the words that substitute for specifics.",
                    )
                )
            sales = word_forms_present(paragraph, EN_SALES)
            if len(sales) >= 2:
                findings.append(
                    Finding(
                        "en-sales-cluster",
                        "en",
                        "content",
                        "medium",
                        "moderate",
                        start_line,
                        re.sub(r"\s+", " ", paragraph)[:180],
                        f"Several promotional adjectives cluster in one paragraph: {', '.join(sales[:6])}.",
                        "Name the concrete benefit and evidence, or reduce the unsupported adjectives.",
                    )
                )
    return findings


def scan_document_density(lines: list[str], languages: Iterable[str], include_low: bool) -> list[Finding]:
    enabled = set(languages)
    text = "\n".join(lines)
    findings: list[Finding] = []

    dash_matches = list(re.finditer(r"—|–|--", text))
    if "zh" in enabled:
        cjk_count = max(1, len(re.findall(r"[\u3400-\u9fff]", text)))
        rate = len(dash_matches) * 1000 / cjk_count
        if len(dash_matches) >= 3 and rate >= 2.0:
            line = text[: dash_matches[0].start()].count("\n") + 1
            findings.append(
                Finding(
                    "zh-dash-density",
                    "zh",
                    "presentation",
                    "low",
                    "minor",
                    line,
                    f"{len(dash_matches)} dash-like marks; about {rate:.1f} per 1,000 Chinese characters",
                    "Dash use is dense relative to this document, but may be an intentional voice or house style.",
                    "Review repeated function; do not impose a zero-dash rule.",
                )
            )

    if "en" in enabled:
        word_count = max(1, len(re.findall(r"\b[A-Za-z][A-Za-z'-]*\b", text)))
        rate = len(dash_matches) * 1000 / word_count
        if len(dash_matches) >= 3 and rate >= 2.5:
            line = text[: dash_matches[0].start()].count("\n") + 1
            findings.append(
                Finding(
                    "en-dash-density",
                    "en",
                    "presentation",
                    "low",
                    "minor",
                    line,
                    f"{len(dash_matches)} dash-like marks; about {rate:.1f} per 1,000 English words",
                    "Dash use is dense relative to this document, but may be intentional.",
                    "Compare with the writer's samples and reduce only repeated rhetorical function.",
                )
            )

    if not include_low:
        findings = [finding for finding in findings if finding.confidence != "low"]
    return findings


def deduplicate(findings: list[Finding]) -> list[Finding]:
    seen: set[tuple[str, int, str]] = set()
    result: list[Finding] = []
    for finding in findings:
        key = (finding.rule_id, finding.line, finding.excerpt)
        if key not in seen:
            seen.add(key)
            result.append(finding)
    confidence_order = {"high": 0, "medium": 1, "low": 2}
    severity_order = {"critical": 0, "major": 1, "moderate": 2, "minor": 3}
    return sorted(
        result,
        key=lambda item: (
            confidence_order.get(item.confidence, 9),
            severity_order.get(item.severity, 9),
            item.line,
            item.rule_id,
        ),
    )


def render_text(languages: Sequence[str], findings: Sequence[Finding]) -> str:
    output = [NOTICE, f"Languages scanned: {', '.join(languages)}", f"Findings: {len(findings)}"]
    if not findings:
        output.append("No configured surface patterns were found. Manual fidelity and craft review is still required.")
        return "\n".join(output)

    for index, finding in enumerate(findings, start=1):
        output.extend(
            [
                "",
                f"{index}. [{finding.confidence.upper()} / {finding.severity}] line {finding.line} — {finding.rule_id}",
                f"   Excerpt: {finding.excerpt}",
                f"   Why review: {finding.message}",
                f"   Suggested operation: {finding.suggestion}",
            ]
        )
    return "\n".join(output)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.max_findings < 1:
        raise SystemExit("error: --max-findings must be at least 1")

    text = read_text(args.file)
    lines = masked_lines(text)
    languages = infer_languages(text, args.lang)

    findings = scan_regex_rules(lines, languages)
    findings.extend(scan_clusters(lines, languages))
    findings.extend(scan_document_density(lines, languages, args.include_low))
    findings = deduplicate(findings)
    if not args.include_low:
        findings = [finding for finding in findings if finding.confidence != "low"]
    findings = findings[: args.max_findings]

    if args.format == "json":
        payload = {
            "notice": NOTICE,
            "languages_scanned": list(languages),
            "finding_count": len(findings),
            "findings": [asdict(finding) for finding in findings],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(render_text(languages, findings))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
