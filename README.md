# CET 试题对练系统

一个面向大学英语四级（CET-4）的 **AI 做题 / 批改 / 复盘** 系统：在线整卷或分项练习，交互式阅读器支持点词查词、生词本与听力播放，客观题自动判分、主观题（写作 / 翻译）由 AI 批改，并按四级 710 分制生成成绩报告与错题本。

题目既可以是**导入的试卷**，也可以是基于 [cet-skill](https://github.com/Liuxiangjian-ai/cet-skill) 现场生成的**原创 CET 仿真题**。

> ⚠️ **本仓库只包含代码，不含任何真题、答案或听力音频。** 详见下方[内容与版权](#内容与版权)。

---

## ✨ 功能特性

- **整卷 / 分项练习** —— 写作、听力、选词填空、信息匹配、仔细阅读、翻译，全题型闭环。
- **AI 出题（`/drill`）** —— 基于 [cet-skill](https://github.com/Liuxiangjian-ai/cet-skill) 的题型与趋势规律，现场生成原创 CET 仿真题，可与已有题目穿插练习。
- **交互式阅读器** —— 重排版面，**点词即查词**、生词本、段落标注、听力音频播放。
- **AI 批改与报告** —— 客观题自动判分；写作 / 翻译交卷即由 AI 批改并计入总分；按四级 **710 分制** 出成绩报告。
- **错题本 / 生词本** —— 错题与查过的生词自动沉淀，供针对性复习。
- **多模型可配置** —— 通过 [ZenMux](https://zenmux.ai) 网关调用 LLM，模型可在「设置」页随时切换。

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 14（App Router）+ React 18 + TypeScript |
| 数据 | Prisma + SQLite |
| 样式 | Tailwind CSS + Radix UI |
| AI | [ZenMux](https://zenmux.ai)（OpenAI 兼容网关），`openai` SDK |

## 内容与版权

- 本仓库**不包含**任何 CET 真题、参考答案或听力录音——这些内容的著作权属于考试主办方及相关权利人。
- 系统设计为配合 [cet-skill](https://github.com/Liuxiangjian-ai/cet-skill) 生成的**原创仿真题**使用；这类内容不复制真题表达，可自由练习。
- 仓库内的导入脚本（`scripts/`）用于处理**你自行准备**的素材。请勿将受版权保护的试卷 / 音频提交到本仓库或对外分发，相关责任由使用者自负。

## 🚀 快速开始

### 环境要求

- Node.js 18+
- 一个 [ZenMux](https://zenmux.ai) API Key（或任意 OpenAI 兼容服务）

### 安装与配置

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量：在项目根目录创建 .env
cat > .env <<'EOF'
DATABASE_URL="file:./dev.db"
ZENMUX_API_KEY="你的_API_KEY"
# 可选，默认即下面这个地址
ZENMUX_BASE_URL="https://zenmux.ai/api/v1"
EOF

# 3. 初始化数据库
npx prisma generate
npx prisma migrate deploy

# 4. 启动开发服务器
npm run dev
```

打开 <http://localhost:13820> 即可使用。也可在「设置」页面里直接填入 API Key 并选择模型。

### 生产部署

```bash
npm run build
npm run start      # 监听 13820 端口
```

<img width="1427" height="944" alt="image" src="https://github.com/user-attachments/assets/1806953a-045c-4d4f-be50-0164191d41e6" />

<img width="1425" height="951" alt="image" src="https://github.com/user-attachments/assets/29b0a7e1-518f-4186-a7b3-3354597d01a6" />

仓库也提供了 `start.sh` / `stop.sh` 便捷脚本。

## 📁 项目结构

```text
app/                  # 页面与 API 路由（做题、AI 出题、批改、报告、设置）
  api/cet/            #   生成 / 批改 / 查词 / 报告等接口
  practice/  drill/   #   做题器 / AI 出题
  errors/    vocab/   #   错题本 / 生词本
components/reader/    # 交互式阅读器（点词查词、听力播放、答题卡、报告）
lib/
  zenmux.ts           # LLM 客户端（ZenMux / OpenAI 兼容）
  prompts/cet/        # 出题 / 批改 / 查词的提示词
  db.ts               # Prisma 客户端
prisma/schema.prisma  # 数据模型（Paper / Section / Question / Attempt …）
scripts/              # 内容导入与校对脚本（需自备素材）
```

## 🔧 脚本说明

`scripts/` 下是一套把外部素材导入数据库的工具链（OCR、答案抽取、听力音频关联、文字层校对等）。这些脚本面向**你自己准备的素材**，仓库本身不附带任何受版权保护的内容。

## 联系方式

团队: 蟑螂恶霸团队（sun740883686@foxmail.com)
项目维护: 仅限学习交流
问题反馈: 请提交 Issue

## 🙏 致谢

本项目的 AI 出题能力建立在 [**cet-skill**](https://github.com/Liuxiangjian-ai/cet-skill) 之上——它基于对 CET 题型结构与命题趋势的提炼，驱动系统生成贴近考试风格的**原创仿真题**。

衷心感谢 [cet-skill](https://github.com/Liuxiangjian-ai/cet-skill) 作者 [@Liuxiangjian-ai](https://github.com/Liuxiangjian-ai) 的开源工作。🙏

## 📄 许可证

本项目代码采用 MIT 许可证。其中 `cet-skill-main/` 目录为 [cet-skill](https://github.com/Liuxiangjian-ai/cet-skill)（MIT）的副本，版权归原作者所有，已保留其 `LICENSE`。
