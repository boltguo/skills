# skilljet

从你自己的 Git 仓库安装和更新 Agent Skills。默认全局安装到 **Codex 和 Claude Code**；首次技能默认全选，安装和更新时都可以用空格取消某一项。

## 本地运行

需要 Git 和 Node.js 22.13+（22.x），或 Node.js 23.5+；建议使用 Node.js 24 LTS。

```bash
npm ci
node bin/skilljet.js install --repo boltguo/skills
node bin/skilljet.js update
```

也可以在本仓库执行 `npm link`，之后直接使用 `skilljet`。

通过 npm 安装：

```bash
npm install -g skilljet
skilljet install --repo boltguo/skills

# 或不全局安装 CLI
npx skilljet install --repo boltguo/skills
```

安装 CLI 不会自动安装技能；需要显式运行 `install`。CLI 更新通过 `npm install -g skilljet@latest` 完成，技能内容更新通过 `skilljet update` 完成。

## 安装与选择

```bash
skilljet install
skilljet install --repo owner/repo
skilljet install --repo git@github.com:owner/private-skills.git
skilljet install --repo /absolute/path/to/local-git-repo
```

默认来源为 `boltguo/skills`。支持 GitHub 简写、HTTPS / SSH Git URL，以及本地 Git 仓库路径。私有仓库沿用本机 Git 凭据或 SSH 配置。本地仓库也只读取已提交的内容，不读取未提交文件。

每次从指定分支或标签获取一个浅克隆，在临时目录扫描并校验，完成后清理。网络失败不会更改已有安装，不会修改技能源仓库。

扫描支持根目录、`skills/` 和其他嵌套布局。遇到 `SKILL.md` 就把其所在目录作为一个完整技能包，不再扫描其内部的嵌套技能。`SKILL.md` 必须包含 YAML frontmatter 中的 `name` 和 `description`。安装目录使用 `name`，名称须为不超过 64 字符的小写字母、数字和单连字符组合。重名、非法元数据或技能内容中的符号链接会停止安装。

`.git`、`node_modules`、`__pycache__`、`.agents`、`.agent`、`.claude`、`.skilljet` 不参与扫描和分发；仓库中的目录符号链接不跟随。

交互流程：

1. 显示来源、范围和目标目录，扫描可用技能。
2. 多选技能：↑↓ 移动，空格切换，`a` 全选/取消全选，回车继续。下方显示当前技能简介。
3. 首次使用该范围时选择工具，默认 Codex 和 Claude Code。
4. 查看实际安装计划并确认。取消确认或 Ctrl+C 不保存本次选择、不应用计划。

后续使用保留的工具选择，可通过 `config` 或 `--agent` 更改。

## 更新规则

```bash
skilljet update
skilljet update --dry-run
skilljet update --yes
skilljet update --all
```

| 情况 | 行为 |
| --- | --- |
| 首次扫描 | 所有技能默认勾选 |
| 已选择的技能有变化 | 默认勾选更新 |
| 仓库新增技能 | 默认勾选并标记“新发现” |
| 之前取消过的技能 | 保持取消；可重新勾选 |
| 已安装技能取消更新 | 保留旧版本，并记住排除状态 |
| 文件内容和执行权限相同 | 跳过文件写入 |
| 上游删除技能内部文件 | 删除未被本地修改的旧托管文件 |
| 上游删除整个技能 | 提示并保留，显式 `remove` 才卸载 |
| 同名目录由其他方式安装 | 标记冲突并跳过 |
| 本地改动或删除托管文件 | 标记冲突并跳过该目标，其他目标继续 |
| 新文件与本地生成内容同名 | 标记冲突并跳过 |

安装和更新始终共用上述选择规则。`--all` 重新选中之前排除的技能；`--skill` 只操作指定名称，不会把其他技能记为排除。取消某个技能会取消它在本次所有选定工具中的安装/更新。

`--yes` 按保存的排除列表执行，新增技能仍默认纳入；它不会强行覆盖冲突。非交互终端必须使用 `--yes` 或 `--dry-run`。`--dry-run` 使用同一选择规则生成计划，可以下载到临时目录，但不写目标、配置、安装记录或锁文件。

遇到冲突，请先备份并处理对应本地内容，再重新执行。第一版不自动接管其他安装器管理的目录或符号链接，也不自动安装技能脚本的依赖。

每个目标目录先暂存再替换，写安装记录失败时回滚该目录；不同目标独立提交。安装过程中异常退出可能留下 `.skilljet-stage-*`、`.skilljet-backup-*` 或锁文件，请保留有用的备份，确认没有进程运行后再清理。此版本不提供跨全部技能的一次性事务或断电恢复。

## 全局与项目级

不传 `--project` 时，**始终操作全局**，即使当前项目已有 skilljet 配置。

```bash
skilljet install --project
skilljet update --project
skilljet list --project
skilljet config --project
skilljet remove --project
```

`--project` 就以当前工作目录为项目位置，不自动跳到 Git 根目录。项目首次使用可继承全局仓库、分支和目标工具，技能选择从全选开始；保存后独立管理，项目更新不会影响全局安装。

| 工具标识 | 全局目录 | 项目目录 |
| --- | --- | --- |
| `codex`（默认） | `~/.agents/skills/` | `.agents/skills/` |
| `claude`（默认） | `~/.claude/skills/` | `.claude/skills/` |
| `antigravity` | `~/.gemini/config/skills/` | `.agents/skills/` |
| `antigravity-cli` | `~/.gemini/antigravity-cli/skills/` | `.agents/skills/` |

项目中多个工具共用 `.agents/skills/` 时，只安装和记录一份。全局不自动额外安装到旧的 `~/.codex/skills` 目录。

目录依据：[Codex](https://learn.chatgpt.com/docs/build-skills)、[Claude Code](https://code.claude.com/docs/en/skills)、[Antigravity](https://antigravity.google/docs/skills)。

## 命令参考

| 命令 | 用途 |
| --- | --- |
| `skilljet` | 交互菜单 |
| `skilljet install` | 扫描、选择并安装；可给新增工具补装 |
| `skilljet update` | 扫描远程变化，选择更新或新增 |
| `skilljet list` | 查看本范围托管的技能、来源、commit 和目标目录 |
| `skilljet list --remote` | 从仓库扫描可用技能；不修改本地配置 |
| `skilljet config` | 交互设置仓库、分支和目标工具 |
| `skilljet remove` | 选择卸载，默认不选中任何项 |

```bash
# 选择工具，空格、逗号或重复参数均可
skilljet install --agent codex claude
skilljet install --agent codex,claude

# 只操作指定技能
skilljet install --skill human-writing-craft lyric-video
skilljet update --skill lyric-video

# 配置仓库、分支；下一次 install/update 生效
skilljet config --repo owner/repo --ref main
skilljet config --ref default
skilljet config --agent codex claude antigravity

# 项目可以使用单独的来源
skilljet install --project --repo owner/project-skills

# 明确选择才允许非交互卸载
skilljet remove --skill lyric-video --yes
skilljet remove --all --dry-run

skilljet --help
skilljet --version
```

每个范围配置一个当前来源仓库；已有安装保留各自来源。更换来源会清空旧选择偏好，但不会删掉原有技能；新来源的同名技能会报冲突，不会覆盖另一仓库的安装。`--ref` 支持分支或标签，`default` 恢复远程默认分支；安装记录保存实际 commit。暂不支持按 commit SHA checkout。

更改目标工具不会自动卸载旧工具里的技能。可用 `remove --agent <工具>` 显式清理。卸载仅删除托管文件，本地生成文件保留；若全部目标中的该技能都卸载成功，会记为排除，避免下次更新又装回来。之后重新安装可用 `--skill <名称>`，但残留的非托管目录需要自行处理。

退出码：`0` 成功或未应用计划；`1` 参数错误、拉取失败、冲突或安装失败；`130` 用户中断交互。

## 配置与安装记录

全局：

```text
~/.config/skilljet/
  config.json    仓库、分支、工具、排除列表
  state.json     每个目标中的技能来源、commit、托管文件摘要
  lock           任务运行期间存在
```

项目级对应当前目录的 `.skilljet/`。项目配置和状态使用相对目标键，可以随项目移动；不要在更新时删除安装记录，否则现有目录将被当作非托管内容。`lock` 和 `*.tmp` 不应提交到 Git。

## 开发与发布

```bash
npm ci
npm run check
npm test
npm pack --dry-run
npm publish --access public
```

测试使用临时 HOME 和本地 Git 仓库，不会写入开发者真实的全局技能目录。发布前自动执行语法检查和测试。npm 包只包含 CLI、说明文档和许可证；skills 在运行时从指定 Git 仓库获取，不打包进 CLI。

发布需要 npm 账号对 `skilljet` 包名具有发布权限。安装 CLI 不会自动安装或更新技能。
