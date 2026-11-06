# skilljet

Install and update your Git-hosted agent skills across Codex, Claude Code, and Antigravity.

**Global by default. Codex and Claude Code preselected. All skills selected on first install.** Review the list and uncheck any skills you do not want. Your choices are remembered for future installs and updates.

## Requirements

- Git
- Node.js 22.x version 22.13 or later, or Node.js 23.5 or later

## Quick start

```bash
npm install -g skilljet

# Scan the default repository and choose skills to install
skilljet install

# Fetch changes and choose which skills to update
skilljet update
```

Or run without installing the CLI globally:

```bash
npx skilljet install
```

The default source is [`boltguo/skills`](https://github.com/boltguo/skills). To use your own repository:

```bash
skilljet install --repo owner/repo
```

The repository and target tools are saved after you confirm the installation. You can change them later with `skilljet config`.

## Choose skills and tools

The installer scans the repository for `SKILL.md` files and shows each skill's name, description, and update status. Use the arrow keys to navigate, **Space** to toggle a skill, **a** to select or deselect all, and **Enter** to continue. Review the plan before applying it.

Install individual skills from the default repository:

```bash
# Image generation
npx skilljet install --skill gemini-image-gen

# Chinese and English writing
npx skilljet install --skill human-writing-craft

# Lyric videos
npx skilljet install --skill lyric-video
```

Specify target tools when needed:

```bash
skilljet install --agent codex claude
skilljet install --agent antigravity antigravity-cli
```

| Tool | CLI identifier | Global location | Project location |
| --- | --- | --- | --- |
| Codex (default) | `codex` | `~/.agents/skills/` | `.agents/skills/` |
| Claude Code (default) | `claude` | `~/.claude/skills/` | `.claude/skills/` |
| Antigravity App / IDE | `antigravity` | `~/.gemini/config/skills/` | `.agents/skills/` |
| Antigravity CLI | `antigravity-cli` | `~/.gemini/antigravity-cli/skills/` | `.agents/skills/` |

Tools sharing the same project directory use one installed copy. Skills are copied with their supporting scripts, references, and assets; skilljet does not create symlinks or install a skill's runtime dependencies.

## Project installation

Use `--project` to install into the **current directory**:

```bash
skilljet install --project
skilljet update --project
skilljet list --project
```

Without `--project`, commands always operate on global installations, even inside a configured project. A new project can inherit the global repository and tools, but keeps its own skill selections and installation records.

## Updates and conflicts

```bash
skilljet update             # Review updates interactively
skilljet update --dry-run   # Preview without changing the installation or config
skilljet update --yes       # Apply saved selection rules without prompts
skilljet update --all       # Preselect everything, including previously excluded skills
```

- Previously selected skills and newly discovered skills are selected by default.
- Previously unchecked skills stay unchecked. Select them again to include them.
- Unchecking an installed skill keeps its current version and excludes it from future updates until you select it again.
- Unchanged files are skipped. Obsolete managed files are removed during updates.
- Local edits, unmanaged directories, and conflicting generated files are reported and skipped. `--yes` does not override conflicts.
- Generated files and other unmanaged content are preserved.
- If an entire skill disappears from the source repository, its local installation is retained until you explicitly remove it.

Skill content is fetched from Git independently of the npm package. Push skill changes to your repository and run `skilljet update`; publish a new npm version only when changing the CLI or its bundled documentation.

To upgrade the CLI itself:

```bash
npm install -g skilljet@latest
```

## Commands

| Command | Purpose |
| --- | --- |
| `skilljet` | Open the interactive menu |
| `skilljet install` | Scan, select, and install skills |
| `skilljet update` | Review changes and update selected skills |
| `skilljet list` | Show managed installations, sources, and versions |
| `skilljet list --remote` | List available skills from the source repository |
| `skilljet config` | Configure the repository, branch or tag, and target tools |
| `skilljet remove` | Select managed skills to uninstall |
| `skilljet --help` | Show all options |

```bash
# Use a specific branch or tag
skilljet config --repo owner/repo --ref main

# Use a private repository through your existing Git SSH setup
skilljet install --repo git@github.com:owner/private-skills.git

# Install from committed content in a local Git repository
skilljet install --repo /absolute/path/to/repo

# Update or remove a particular skill
skilljet update --skill lyric-video
skilljet remove --skill lyric-video
```

Each scope has one configured source repository. Global configuration and installation records live in `~/.config/skilljet/`; project records live in `.skilljet/`. Keep the installation records so skilljet can distinguish its own files from other installations.

See the [detailed command reference (Chinese)](docs/skilljet.md) for selection rules, storage, and recovery details. The CLI prompts are currently in Chinese.

## Skills in this repository

| Skill | What it does | Additional requirements |
| --- | --- | --- |
| [gemini-image-gen](gemini-image-gen/SKILL.md) | Generate and edit images through the Gemini API, with reference images and configurable output settings | Python 3, a Gemini API key, and network access |
| [human-writing-craft](human-writing-craft/SKILL.md) | Draft, revise, translate, and audit Chinese and English prose | No additional API key for the writing workflow; Python 3 for the optional text audit script |
| [lyric-video](lyric-video/SKILL.md) | Turn lyrics and optional audio into animated typography videos, previews, transparent video, or image sequences | Node.js, ffmpeg, and Playwright with Chromium |

After installation, describe your task to the agent or name the skill explicitly:

```text
Use gemini-image-gen to create a watercolor illustration of a cafe at sunrise.

Use human-writing-craft to revise this draft while preserving its meaning and facts.

Use lyric-video to turn lyrics.txt and demo.mp3 into a vertical lyric video.
Show me a preview before rendering the final video.
```

For Gemini image generation, set your API key before starting the agent:

```bash
export GEMINI_API_KEY="your-api-key"
```

`GOOGLE_API_KEY` is also supported. For lyric videos, follow the setup instructions in [lyric-video/SKILL.md](lyric-video/SKILL.md) to install rendering dependencies. Each skill's `SKILL.md` contains its complete workflow and usage notes.

## Development

```bash
npm ci
npm run check
npm test

# Register the local CLI for development
npm link
```

Tests use temporary home directories and local Git fixtures; they do not modify your actual global skills. Local agent directories are excluded from version control.

To inspect the npm package contents:

```bash
npm pack --dry-run
```

The npm package contains the CLI and its documentation. Skills are downloaded from the configured Git repository at runtime.

## License

[MIT](LICENSE)
