# Agent Skills

一组面向支持 Agent Skills 的 AI 助手的实用技能，目前涵盖 **Gemini 图片生成**、**中英文写作** 和 **歌词视频**。安装后，在对话中描述需求，Agent 会按照技能提供的流程、参考资料和工具完成任务。

每个技能都可以单独安装，具体说明见各自的 `SKILL.md`。通过 [Skills CLI](https://github.com/vercel-labs/skills)，可以安装到 Claude Code、Codex、Cursor 等工具。

## 有哪些技能

| 技能 | 主要能力 | 使用条件 |
| --- | --- | --- |
| [gemini-image-gen](gemini-image-gen/SKILL.md) | 通过 Gemini API 生成图片，选择模型、尺寸和比例，保存图片及生成记录 | Python 3、Gemini API Key、网络连接 |
| [human-writing-craft](human-writing-craft/SKILL.md) | 中英文去 AI 味、润色改写、内容创作、文风匹配、翻译和写作审校 | 写作流程无需额外 API Key；可选文本扫描工具需要 Python 3 |
| [lyric-video](lyric-video/SKILL.md) | 把歌词（可配歌曲）自动编排成文字 PV / 动态歌词视频，按节拍切镜，导出 MP4、透明 MOV 或 PNG 序列 | Node.js 18+、ffmpeg、Playwright（Chromium） |

## 如何安装

先准备好 Node.js（含 `npx`）和 Git，再在终端运行：

```bash
npx skills add boltguo/skills
```

按提示选择要安装的技能和目标 Agent。也可以只安装某个技能：

```bash
# 图片生成
npx skills add boltguo/skills --skill gemini-image-gen

# 中英文写作
npx skills add boltguo/skills --skill human-writing-craft

# 歌词视频
npx skills add boltguo/skills --skill lyric-video
```

如需直接指定目标工具，在安装命令中添加 `--agent`：

| 目标工具 | 添加的参数 |
| --- | --- |
| Claude Code | `--agent claude-code` |
| Codex | `--agent codex` |
| Cursor | `--agent cursor` |

例如，将写作技能全局安装到 Codex：

```bash
npx skills add boltguo/skills --skill human-writing-craft --agent codex -g
```

默认安装到当前项目；在命令末尾添加 `-g` 可安装到用户目录，供多个项目使用。更多选项见 [Skills CLI 文档](https://github.com/vercel-labs/skills#install-a-skill)。

## 如何使用

安装后，在 Agent 对话中直接提出需求。也可以明确写出技能名称，指定使用哪个技能。

### Gemini 图片生成

适合生成插画、封面、海报、概念图等图片。支持：

- 根据文字描述生成图片，指定画面内容、风格、光线和构图。
- 选择 Flash 或 Pro 模型，以及模型支持的图片尺寸和宽高比。
- 将图片、提示词和生成参数保存到独立目录，方便查阅和复用。
- 按需保存 API 原始响应，便于排查问题。

首次使用前，从 [Google AI Studio](https://aistudio.google.com/apikey) 获取 API Key，并在启动 Agent 的终端中设置：

```bash
export GEMINI_API_KEY="你的 API Key"
```

也支持使用 `GOOGLE_API_KEY` 环境变量。

使用示例：

```text
使用 gemini-image-gen，生成一张咖啡店门口的水彩插画，
清晨光线，暖色调，画面比例 16:9，尺寸 2K。
```

```text
用 Gemini 生成一张竖版科幻小说封面，雨夜城市、霓虹灯、孤独的行人，
比例 9:16，不要文字。
```

生成结果默认保存在 `gemini-images/时间戳-提示词摘要/`，包含图片和记录提示词、参数的 `prompt.md`；选择保存原始响应时，还会生成 `response.json`。

### 中英文写作

适合已有文本的修改，也适合根据资料从零起草。支持：

- **去 AI 味与润色**：减少套话、空泛表达和机械重复，让文字更自然。
- **内容创作**：根据笔记、提纲或资料组织内容，写成完整初稿。
- **文风匹配**：参考用户提供的写作样本，调整语气、节奏和表达习惯。
- **中英翻译**：减少翻译腔，保留原文含义、专业术语和必要格式。
- **只审不改**：指出具体问题、原因和修改建议，保留原文。
- **文件内编辑**：按要求修改指定文本区域，保留未授权修改的内容。

修改时优先保留事实、数字、引用、术语和语义关系；创作时依据提供的材料，不凭空编造经历或来源。

使用示例：

```text
使用 human-writing-craft，把下面这段文字去一下 AI 味，尽量少改。
保留所有事实、数字和引用，只输出修改后的正文：

［粘贴原文］
```

```text
根据这些项目笔记写一篇复盘，参考我提供的两篇文章匹配文风。
不要编造经历或数据，材料不足的地方标出来。
```

```text
把这篇英文技术说明翻译成自然中文，保留命令、参数、链接和专业术语。
```

```text
只检查这篇文章里的套话、重复和结构问题，指出具体位置与原因，不要重写。
```

技能还提供可选的文本扫描工具。在本仓库根目录运行：

```bash
python3 human-writing-craft/scripts/audit_text.py path/to/draft.md --lang auto
```

扫描工具仅标记需要结合上下文判断的表达，不判断作者身份，也不输出“AI 概率”。

### 歌词视频

适合给原创歌曲、翻唱或 Demo 做歌词视频（文字 PV / Lyric Video）。渲染引擎来自开源项目 [JIZURA 字面](https://github.com/852wa/JIZURA)，无需打开编辑器。支持：

- 根据歌词自动编排每个镜头的版式、进出场动画、装饰、背景和转场，换一个种子就是另一种编排。
- 读入歌曲后检测 BPM 和节拍，镜头切换对齐拍点，并把音轨合成进视频；提供 LRC 时间戳时，每句歌词会对准演唱时间。
- 6 个主题（文字PV、动态字幕、和风、恐怖、流行、抒情）和 27 种配色风格。
- 先出一张样片拼图预览，满意后再导出完整视频；保存的 `project.json` 可以原样复用。
- 画面比例 16:9 / 9:16 / 1:1 等，720p～4K，24 / 30 / 60fps。
- 导出 MP4（H.264，可带音轨）、绿幕或黑底素材、透明 ProRes 4444 MOV、PNG 序列。

首次使用前安装渲染依赖（还需要系统里有 `ffmpeg`）：

```bash
npm install --prefix <技能目录>/scripts
npx --prefix <技能目录>/scripts playwright install chromium
```

使用示例：

```text
用 lyric-video 把 lyrics.txt 做成竖版歌词视频，配上 demo.mp3，风格偏抒情。
```

```text
把这首歌的 LRC 歌词做成文字 PV，先给我看几版样片，选好后导出 1080p MP4。
```

```text
把歌词做成绿幕素材，我要拿到剪辑软件里合成。
```

结果默认保存在 `lyric-videos/时间戳-歌词摘要/`，包含 `video.mp4`、可复用的 `project.json` 和逐镜头记录 `cuts.json`。在 4 核机器上，1080p 大约每秒渲染 15 帧，一首 4 分钟的歌约需 6～7 分钟。

歌词需由用户提供，歌词和歌曲的权利归原权利人所有；生成的视频归制作者所有。

许可证：[MIT](LICENSE)。
