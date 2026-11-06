# Agent Skills

Reusable skills for AI coding agents. Each skill includes a `SKILL.md` workflow and any supporting scripts, references, or assets it needs.

The [skillsm CLI](https://github.com/boltguo/skillsm) is maintained in a separate repository.

## Available skills

| Skill | Purpose | Requirements |
| --- | --- | --- |
| [gemini-image-gen](gemini-image-gen/SKILL.md) | Generate and edit images through Gemini, including reference images | Python 3, a Gemini API key, network access |
| [human-writing-craft](human-writing-craft/SKILL.md) | Draft, revise, translate, and audit Chinese and English prose | No additional API key; Python 3 for the optional text audit script |
| [lyric-video](lyric-video/SKILL.md) | Turn lyrics and optional audio into animated typography videos | Node.js, ffmpeg, Playwright with Chromium |

## Install a skill

Use skillsm to choose the skills and Agent tools you want:

```bash
npx skillsm sync --repo boltguo/skills
```

Your selections are saved. Run `npx skillsm sync` to update them or change your choices. Review the plan before confirming; deselected or deleted skills are removed, while generated files are preserved. Add `--project` for a project-specific installation. See the [skillsm documentation](https://github.com/boltguo/skillsm#readme) for requirements and options.

To install manually, clone this repository and copy the skill's **entire directory**, including its supporting files, into your agent's skills directory. For example:

```bash
git clone https://github.com/boltguo/skills.git
cd skills

# Codex (global)
mkdir -p ~/.agents/skills
cp -R human-writing-craft ~/.agents/skills/

# Claude Code (global)
mkdir -p ~/.claude/skills
cp -R human-writing-craft ~/.claude/skills/
```

For a project-specific installation, use `.agents/skills/` or `.claude/skills/` inside that project. If a destination already exists, review your local changes before replacing it.

Each skill's `SKILL.md` describes its complete setup and workflow. Copying a skill does not install its runtime dependencies.

## Use a skill

Describe the task to your agent, or name the skill explicitly:

```text
Use gemini-image-gen to create a watercolor illustration of a cafe at sunrise.

Use human-writing-craft to revise this draft while preserving its meaning and facts.

Use lyric-video to turn lyrics.txt and demo.mp3 into a vertical lyric video.
Show me a preview before rendering the final video.
```

For image generation, set your API key before starting the agent:

```bash
export GEMINI_API_KEY="your-api-key"
```

`GOOGLE_API_KEY` is also supported. For lyric video rendering, follow the dependency setup in [lyric-video/SKILL.md](lyric-video/SKILL.md).

## Repository layout

```text
<skill-name>/
  SKILL.md       # Skill metadata and workflow
  scripts/       # Optional executable helpers
  references/    # Optional supporting guidance
  assets/        # Optional reusable assets
```

Skills may also include templates or vendored components with their own licenses. Local working files, agent links, and generated outputs are excluded from version control.

## License

[MIT](LICENSE), except where a bundled component specifies its own license.
