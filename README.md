# CET-4 作战台

四级备考工作台 · 新复古粗犷风（Neo-Brutalism）· 纯静态零依赖

**线上地址**：https://cet4-workbench.3358859283z.workers.dev

## 功能

- **考试倒计时** — 默认 2026-12-12（预计考期，页内可改）
- **真实词库 x4** — 数据来自 [kajweb/dict](https://github.com/kajweb/dict)（百词斩官方词书导出），含音标 / 释义 / 例句 / 短语：
  | 词库 | 词数 | 定位 |
  |---|---|---|
  | 核心必背 | 1162 | 按考频排序，优先背 |
  | 真题考点词 | 2607 | 附 251 道真题选择题 |
  | 高频速记 | 1162 | 高频乱序，冲刺用 |
  | 大纲全词 | 3739 | 全量覆盖查漏补缺 |
- **间隔复习** — 五级盒子算法（1/2/4/7/15 天），认识拉长间隔、不认识退回重学
- **每日新词配额** — 自定义 1–50 个/天
- **学习计划** — 三阶段作战卡 + 每日清单 + 周课表
- **统计** — 掌握分布 / 连续打卡 / 近 14 天记录
- 键盘流：`SPACE` 翻面 · `1/2/3` 评级 · `S` 发音
- 移动端底部导航适配

## 本地运行

纯静态站点，任意静态服务器指向根目录即可：

```bash
node server.js        # 或 python -m http.server
```

## 部署

### 方式一：Cloudflare Pages（推荐，连 GitHub 自动部署）

1. Fork / push 本仓库到你的 GitHub
2. 打开 [Cloudflare Dashboard → Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) → Create → Pages → **Connect to Git**
3. 选择本仓库，构建配置：
   - **Framework preset**: `None`
   - **Build command**: 留空
   - **Build output directory**: `/`
4. Save and Deploy —— 之后每次 `git push` 自动重新部署

### 方式二：Wrangler 手动部署

```bash
npx wrangler login
npx wrangler deploy
```

## 词库再生成

原始 JSONL 数据解包到 `zips/` 后执行 `node build_banks.js`。

## 说明

- 学习进度存于浏览器 localStorage，各设备独立
