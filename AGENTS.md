# AGENTS.md · 训练日程意图舱

给后续 Agent / 协作者的一页说明。

## 版本

**v1.1 / Step2（帝王蟹意向 · ICS 能力）**

## 目标闭环

```
样例 / 粘贴意图
  → 规则解析 + 匹配已有训练事件
  → 提案卡（旧/新时间 · 冲突提示）
  → 用户：确认 | 修改 | 拒绝
  → 执行写操作
       · ICS 模式：更新内存事件 + 序列化 .ics（可下载）
       · JSON 模式：localStorage（v1 练习）
  → 结果核验 + 审计日志
  → 失败态：拒绝 / 过期 / 写冲突
```

## 能力边界（必须诚实）

| 层 | Step2（本仓） | 未接 / 勿宣称 |
|---|---|---|
| 输入 | 样例消息（练习入口）或粘贴文本 | 真实邮件 / Matrix / Rinx 入站 |
| 日程读 | **真**：`data/hyrox-training.ics` RFC5545 解析；可导入用户 `.ics` | 系统 Calendar.app 读 API |
| 日程写 | **真**：生成更新 ICS（UID 稳定 · DTSTART/DTEND 更新 · SUMMARY 保留）并下载 | Calendar.app 写 API；Rinx（原名 robrix2）宿主授权卡 |
| UI | 静态网页卡 | Rinx 原生小程序 |
| 解析 | 关键词规则 + 冲突避让 | Octoscript / Agent 内环 |

**硬规则：** UI、README、本文件必须标明真/未接；禁止在未接真宿主能力时宣称「已写入系统日历」或「已接 Rinx / robrix2」。

## 模式

- `ICS 真日历`（默认）：权威源 ICS；确认 → 下载核验  
- `练习 JSON`：`data/schedule.json` + localStorage（保留 Step1）

## 状态机

`idle → proposed → {confirmed | rejected | expired}`

- `proposed` 带 TTL（演示默认 90s；可强制过期）  
- `confirmed` 后日程列表高亮改期项；ICS 模式下可下载  
- `rejected` / `expired` 不改日程  

## 关键文件

| 文件 | 职责 |
|---|---|
| `js/calendar-ics.js` | ICS 解析 / 序列化 / 下载（无依赖） |
| `js/app.js` | 闭环接线、模式切换、失败态 |
| `data/hyrox-training.ics` | 默认权威日程 |

## 不要做（初赛）

- 不接百度 / 农场选题  
- 不冲 ROM / STEP3  
- 不把完整邮箱 OAuth 当必选项  
- 不假装已接 Rinx（原名 robrix2）日历 API  
- 不在本机死磕无 GUI 的 Rinx 编译（见 `env-notes.md`）

## 扩展钩子（M4+ / 晋级）

1. 提案卡样式对齐官方 AppCard。  
2. 写入适配器：`IcsFileAdapter` → `RinxCalendarAdapter`（待官方 API）。  
3. 钉定 Rinx commit 写入 README（已记录 9b5e570，见 env-notes.md）。  
4. 样例意图可切换多条。
