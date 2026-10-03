# env-notes · 宿主环境（Rinx，原名 robrix2）

> 更新：2026-10-03（北京时间）。主基线已由 **robrix2** 更名为 **Rinx**。本文保留 2026-09-23 对 robrix2 的检查记录作为历史。

## 1. 当前宿主：Rinx

| 项 | 结果 |
|---|---|
| 仓库 | https://github.com/hagency-org/Rinx （Apache-2.0；README：“Built on Robrix”） |
| 默认分支 | `main` |
| 参考提交 | `9b5e570aa7e6c845d02d768efdf72d1308fc7849`（2026-10-03 07:40 北京时间，`feat(invite): find people by name in the invite dialog (#54)`） |
| Release | 暂无发布标签 |
| 工具链 | 仓库 pin **Rust 1.98.0**，另需 CMake；macOS 产物 `Rinx.app`，可执行文件 `rinx` |
| 兼容性 | 保留 `rs.robius.robrix.*` Matrix 事件类型，网页卡片 / 小程序 / 文章与 robrix2 互通；登录回调 `rinx://login` |
| 宿主能力（官网口径） | 网页卡片（分享 HTTP(S) 地址，页面**不会**因此获得聊天记录或账号权限）+ 原生文章编辑器；新增原生小程序需扩展并构建宿主 |

## 2. 本作品与宿主的关系

- 本仓是**独立静态网页 Demo**，不依赖 Rinx 构建，也**没有**调用 Rinx 的授权卡或任何宿主 API。
- 计划接入方式：部署到 HTTPS 后，以 **Rinx 网页卡片（URL 卡片）**分享打开（见 `SUBMISSION.md` §10）。
- 晋级后再评估：用 Rinx 宿主授权卡替换页内「确认 / 拒绝」，并把写入适配器从 `IcsFileAdapter` 换成宿主日历能力。

## 3. 本机（Linux agent box）可行性

| 检查 | 状态 |
|---|---|
| OS | Debian 13 (trixie) · x86_64 · **无桌面 GUI 会话** |
| `rustc` | 系统包 1.85.1，低于 Rinx pin 1.98.0 |
| `cmake` / `clang` | 未安装 |
| GUI 运行 | 无显示，不适合交互运行 Makepad 桌面端 |

**结论：** 本机只用于跑网页 Demo 与无头浏览器截图；未执行 `cargo build` / `cargo run`。在有 GUI 的参赛机上可按 Rinx README 构建后，用网页卡片打开本 Demo 的 HTTPS 地址。

## 4. 历史记录：robrix2（2026-09-23）

| 项 | 结果 |
|---|---|
| 命令 | `git clone --depth 1 https://github.com/OctoSense-org/robrix2.git robrix2-ref`（只读参考） |
| HEAD | `da375f2`（`Merge pull request #332 from Project-Robius-China/fix/e2e-custom-message-preview`） |
| 工具链 | 当时 pin Rust 1.97.1 |
| 备注 | 当时 shallow 树无 `lab/article-editor` 目录；原生示例需按官网钉定提交另取 |
