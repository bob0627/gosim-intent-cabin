# AGENTS.md · 训练日程意图舱

给后续 Agent / 协作者的一页说明。

## 目标闭环

```
样例输入事件
  → 规则/Agent 解析 + 匹配已有训练事件
  → 提案卡（旧/新时间 · 冲突提示）
  → 用户：确认 | 修改 | 拒绝
  → 执行写操作（v1 = localStorage）
  → 结果核验 + 审计日志
  → 失败态：拒绝 / 过期 / 写冲突
```

## 练习数据 vs 真日历

| 层 | v1（本仓） | 目标态（robrix2） |
|---|---|---|
| 输入 | `SAMPLE_INTENT` 写死在 `js/app.js` | 邮件/即时消息/用户自述事件 |
| 日程源 | `data/schedule.json` | 日历读能力 |
| 写入 | `localStorage` 键 `gosim-intent-cabin-v1` | 日历写能力 + 宿主授权 |
| UI | 静态网页卡 | robrix2 网页卡 / 原生小程序 |
| 解析 | 关键词规则 + 冲突避让 | Octoscript / Agent 内环 |

**硬规则：** UI 与 README 必须标明练习数据；禁止在未接真能力时宣称「已写入系统日历」。

## 状态机

`idle → proposed → {confirmed | rejected | expired}`

- `proposed` 带 TTL（演示默认 90s；可强制过期）  
- `confirmed` 后日程列表高亮改期项  
- `rejected` / `expired` 不改日程  

## 不要做（初赛）

- 不接百度 / 农场选题  
- 不冲 ROM / STEP3  
- 不把完整邮箱 OAuth 当必选项  
- 不在本机死磕无 GUI 的 robrix2 编译（见 `env-notes.md`）

## 扩展钩子（M4+）

1. 把 `SAMPLE_INTENT` 换成可切换的多条样例。  
2. 提案卡样式对齐官方 AppCard。  
3. 写入适配器：`LocalStoreAdapter` → `RobrixCalendarAdapter`。  
4. 钉定 robrix2 commit 写入本 README。
