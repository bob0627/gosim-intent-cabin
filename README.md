# 训练日程意图舱 · GOSIM Agentic App 2026

> Idea A（已锁定）· **v1.1 / Step2（帝王蟹意向 · ICS 能力）** · 许可 **Apache-2.0**  
> 成员：bob0627（个人）· 宿主目标：[OctoSense-org/robrix2](https://github.com/OctoSense-org/robrix2)  
> 截止：2026-10-04 23:59（北京时间）

## 一句话

样例「改期意图」→ 规则解析出改期提案卡 → 用户确认 / 修改 / 拒绝 → **写回 ICS（或练习 JSON）** → 结果核验；可演示拒绝与过期失败态。

## Step1 vs Step2

| | Step1（v1） | Step2（v1.1 · 本版） |
|---|---|---|
| 日程源 | `data/schedule.json` | 默认 **`data/hyrox-training.ics`**（真解析） |
| 写入 | 仅改 localStorage 内存态 | **生成/下载更新后的 `.ics`**（UID 稳定，DTSTART/DTEND 更新） |
| 导入 | 无 | 用户上传 `.ics` → 解析进日程 → 再走提案 |
| 模式 | 仅练习 JSON | **`ICS 真日历`**（默认）\| `练习 JSON` |
| 未接 | — | 系统 Calendar.app API、robrix2 宿主授权卡（诚实声明） |

## 快速打开

```bash
cd gosim-intent-cabin
python3 -m http.server 8877
# 浏览器打开 http://127.0.0.1:8877/
# （若端口占用，换任意空闲端口即可）
```

也可用浏览器直接打开 `index.html`。若 `file://` 无法 `fetch` 数据文件，脚本会使用内嵌 ICS/JSON 兜底，闭环仍可走通。

**依赖：** 纯前端，无 npm、无 CDN。ICS 解析/序列化为自写轻量实现（`js/calendar-ics.js`，VEVENT 子集：UID / SUMMARY / DTSTART / DTEND / DESCRIPTION / LOCATION）。

## Step2 演示脚本（约 3 分钟 · ICS 核验）

### 快乐路径（ICS）

1. 打开页面，确认模式为 **「ICS 真日历」**（默认）；右侧日程来自解析 `data/hyrox-training.ics`。  
2. 左侧可见教练改期样例（或粘贴自定义文本）。  
3. 点 **「解析意图 → 生成提案卡」**。  
4. 查看旧/新时间对比；若与已有课冲突，Agent 会建议避让时段。  
5. （可选）修改日期/时间 → **应用修改到提案**。  
6. 点 **「确认授权 · 写回 ICS」**。  
7. 点 **「下载更新后的 ICS」** → 用文本编辑器打开，确认目标事件 **UID 不变**、**DTSTART/DTEND 已改为新时间**、**SUMMARY 保留**。  
8. （人工）将 `.ics` 拖进 Apple 日历核对显示时间。

### 导入 ICS

1. 点 **「导入 ICS」**，选择任意含 `VEVENT` 的 `.ics`（可用本仓 `data/hyrox-training.ics` 复制改名试）。  
2. 右侧日程应更新为解析结果。  
3. 再走提案 → 确认 → 下载，核验写回。

### 失败态（与 v1 相同，仍可用）

| 态 | 步骤 |
|---|---|
| **拒绝** | 重置 → 生成提案 → **拒绝** → 核验失败，日程不变 |
| **过期** | 重置 → 生成提案 → **强制过期**（或等 ~90s）→ 无法写入 |
| **写冲突** | 生成提案后，把新时间改到与已有课重叠（如周三 18:30–19:45）→ 确认 → 提示冲突，未写入 |

### 练习 JSON 模式

点 **「练习 JSON」** 切回 v1 行为（`schedule.json` + localStorage），便于对比 Step1。

## 能力边界（诚实声明）

| 真 | 未接 |
|---|---|
| ICS 读解析 | 系统 Calendar.app / 原生日历 API |
| ICS 写导出 / 下载 | robrix2 宿主授权卡 |
| 导入用户 `.ics` | 真实邮件/即时消息入站 |

输入意图仍可以是**样例消息（练习入口）**，或粘贴一段文本。勿宣称「已写入系统日历」或「已接 robrix2」。

## 仓库结构

```
gosim-intent-cabin/
├── index.html              # 单页 Demo
├── css/styles.css
├── js/calendar-ics.js      # ICS 解析 / 序列化 / 下载（无依赖）
├── js/app.js               # 解析 / 提案 / 授权 / 模式切换
├── data/hyrox-training.ics # Step2 权威日程源（RFC5545）
├── data/schedule.json      # Step1 练习 JSON（模式切换仍可用）
├── LICENSE                 # Apache-2.0
├── README.md
├── AGENTS.md               # 架构与数据边界
└── env-notes.md            # robrix2 本机环境结论
```

## 钉定说明（宿主）

- 参考 clone：`robrix2-ref/`（shallow，只读）  
- 当前记录 commit：见 `env-notes.md`  
- **本版不依赖、不假装已接 robrix2 日历 API**；官方 9/24 发布包后再评估宿主授权卡。

## no-facts

- 演示中的教练消息、场地等可为练习数据。  
- ICS 文件读写是真实能力；**下载的 ICS 需用户自行导入系统日历**，本页不直接改 Calendar.app。  
- 不得据此对外声称「已改真实系统日历」或「已接 robrix2」。

## 本地 Git

本目录已是 git 仓。公开推送到 GitHub `bob0627` 需本机 `gh auth` 就绪后再做（本环境未登录，不阻塞 Demo）。
