# skilljet reference

Install and update Agent Skills from a Git repository. The default scope is **global**, the default tools are **Codex and Claude Code**, and all skills are selected on the first install. Both installation and updates support interactive selection.

## Requirements and installation

Install Git and use Node.js 22.x version 22.13 or later, or Node.js 23.5 or later.

```bash
npm install -g skilljet
skilljet install --repo boltguo/skills
skilljet update

# Run without installing the CLI globally
npx skilljet install --repo boltguo/skills
```

For local development, run `npm ci` in this repository and use `node bin/skilljet.js`, or register the command with `npm link`.

Installing the CLI does not install skills automatically. Update the CLI with `npm install -g skilljet@latest`; update skill content with `skilljet update`.

## Repository sources

```bash
skilljet install
skilljet install --repo owner/repo
skilljet install --repo git@github.com:owner/private-skills.git
skilljet install --repo /absolute/path/to/local-git-repo
```

The default repository is `boltguo/skills`. Supported sources include GitHub shorthand, HTTPS or SSH Git URLs, and local Git repositories. Private repositories use your existing Git credentials or SSH setup. Local repositories are read from committed content; uncommitted changes are not included.

Each operation obtains a shallow clone of the selected branch or tag in a temporary directory, validates the skills, and removes the clone afterward. A failed fetch does not change existing installations or the source repository.

Each scope has one configured source. Changing it resets the selection exclusions but does not remove existing skills. An installed skill retains its source identity; a same-named skill from a different repository causes a conflict rather than being overwritten.

`--ref` accepts a branch or tag. Use `--ref default` to follow the remote default branch. Installation records store the actual commit. Checking out a commit SHA is not currently supported.

## Skill discovery

A skill is a directory containing a regular `SKILL.md` file with YAML frontmatter and valid `name` and `description` fields. Names must be no more than 64 characters, using lowercase letters, digits, and single hyphens between segments. The `name` becomes the installed directory name.

Discovery supports repository-root, `skills/`, and other nested layouts. Once a skill is found, its directory is treated as one bundle; discovery does not search inside it for further skills. Scripts, references, templates, and other supporting files are copied with the skill.

The following are excluded from discovery and distribution: `.git`, `.agents`, `.agent`, `.claude`, `.skilljet`, `node_modules`, `__pycache__`, and `.DS_Store`. Directory symlinks are not followed. Duplicate names, invalid metadata, or symlinks inside a skill stop installation before target files are changed.

## Interactive selection

1. Review the source, scope, and target directories.
2. Select skills using the arrow keys and Space. Press `a` to select or deselect all and Enter to continue. The current skill's description is shown below the list.
3. On first use of a scope, select target tools. Codex and Claude Code are preselected.
4. Review the plan and confirm to apply it and save your selections.

Declining the final confirmation or interrupting a prompt cancels the operation without saving the new selection or applying the plan. Later operations reuse the saved tools. Change them using `config` or `--agent`.

CLI messages are in English. Skill descriptions retain the language of the source repository. Terminal symbols provided by the prompt library depend on terminal support.

## Update behavior

```bash
skilljet update
skilljet update --dry-run
skilljet update --yes
skilljet update --all
```

| Situation | Behavior |
| --- | --- |
| First scan | All skills are preselected |
| Previously selected skill changes | Preselected for update |
| New skill appears | Preselected and marked New |
| Previously unchecked skill | Remains unchecked until selected again |
| Installed skill is unchecked | Keeps its installed version and is excluded from later updates |
| Content and executable permissions are unchanged | Target files are not rewritten |
| Upstream removes files from a skill | Unmodified managed files are removed during the update |
| Upstream removes an entire skill | Local installation is kept; use remove explicitly |
| Same-named directory belongs to another installer | Conflict; target is skipped |
| Managed file is edited or deleted locally | Conflict; that target is skipped |
| New upstream file collides with unmanaged local content | Conflict; target is skipped |

Installation and updates share the same selection rules. `--all` preselects previously excluded skills again. `--skill` limits the operation without excluding unrelated skills. A skill selection applies to all tools selected for that operation.

`--yes` uses saved exclusions and includes newly discovered skills. It never overrides conflicts. A noninteractive terminal requires `--yes` or `--dry-run`.

`--dry-run` uses the same selection rules and may fetch into a temporary directory, but does not write target files, configuration, installation records, or a scope lock.

## Conflict handling and recovery

Back up and resolve conflicting local files before retrying. skilljet does not automatically take ownership of other installers' directories or symlinks. It does not install runtime dependencies for skill scripts.

Updates preserve generated files and other unmanaged content. Each target is staged before replacement; a failure to save installation state rolls back that target. Different target directories commit independently.

An interrupted process may leave `.skilljet-stage-*`, `.skilljet-backup-*`, or a scope lock. Preserve useful backups and confirm that no skilljet process is running before removing a stale lock. This version does not provide a single transaction across all skills or automatic recovery after power loss.

## Global and project scopes

Commands always operate globally unless `--project` is supplied, even inside a configured project.

```bash
skilljet install --project
skilljet update --project
skilljet list --project
skilljet config --project
skilljet remove --project
```

The project location is the current working directory; skilljet does not jump to the Git repository root. A new project inherits the global repository, ref, and target tools, while starting with all skills selected. Once saved, project configuration and installation records are independent of the global scope.

| Tool identifier | Global directory | Project directory |
| --- | --- | --- |
| `codex` (default) | `~/.agents/skills/` | `.agents/skills/` |
| `claude` (default) | `~/.claude/skills/` | `.claude/skills/` |
| `antigravity` | `~/.gemini/config/skills/` | `.agents/skills/` |
| `antigravity-cli` | `~/.gemini/antigravity-cli/skills/` | `.agents/skills/` |

Shared project destinations are deduplicated. The legacy global `~/.codex/skills` directory is not an additional installation target.

Location references: [Codex](https://learn.chatgpt.com/docs/build-skills), [Claude Code](https://code.claude.com/docs/en/skills), [Antigravity](https://antigravity.google/docs/skills).

## Command examples

```bash
# Select tools: spaces, commas, or repeated flags are supported
skilljet install --agent codex claude
skilljet install --agent codex,claude

# Operate on specific skills
skilljet install --skill human-writing-craft lyric-video
skilljet update --skill lyric-video

# Configure a source and ref; apply with install or update
skilljet config --repo owner/repo --ref main
skilljet config --ref default
skilljet config --agent codex claude antigravity

# Use a separate source for the current project
skilljet install --project --repo owner/project-skills

# View local installations or available remote skills
skilljet list
skilljet list --remote

# Noninteractive removal requires an explicit selection
skilljet remove --skill lyric-video --yes
skilljet remove --all --dry-run

skilljet --help
skilljet --version
```

Changing target tools does not uninstall skills from old targets. Use `remove --agent <tool>` to clean them up explicitly. Removal deletes managed files only; generated files are retained, and local edits cause a conflict.

When a skill has been successfully removed from every managed target in the scope, it is added to the exclusions so that the next update does not reinstall it. To reinstall, select it again or pass `--skill <name>`. Any remaining unmanaged directory must be handled first.

Exit codes: `0` for success or a declined plan, `1` for invalid arguments, fetch failures, conflicts, or installation failures, and `130` for an interrupted prompt.

## Configuration and installation records

Global storage:

```text
~/.config/skilljet/
  config.json    Repository, ref, tools, and exclusions
  state.json     Source, commit, and managed file fingerprints per target
  lock           Present while a modifying operation is running
```

Project storage uses `.skilljet/` in the current directory. Target keys are relative so projects can be moved. Retain installation records: without them, an existing directory is treated as unmanaged. Do not commit `lock` or `*.tmp` files.

## Development and release

```bash
npm ci
npm run check
npm test
npm pack --dry-run
```

Tests use temporary home directories and local Git repositories. The npm package contains only the CLI, documentation, and license; skills are fetched at runtime.

Publishing is a separate explicit action requiring access to the npm package:

```bash
npm publish --access public
```

The prepublish check runs syntax validation and the test suite. Installing the CLI does not automatically install or update skills.
