# env-notes · 宿主环境（Rinx，原名 robrix2）

> 更新：2026-10-04（北京时间）。主基线已由 **robrix2** 更名为 **Rinx**。本文保留 2026-09-23 对 robrix2 的检查记录作为历史。

## 1. 当前宿主：Rinx

| 项 | 结果 |
|---|---|
| 仓库 | https://github.com/hagency-org/Rinx （Apache-2.0；README：“Built on Robrix”） |
| 默认分支 | `main` |
| 实测提交 | `f18869e4674fb8ffb666b424879ab820d114e432`（2026-10-04 14:22 北京时间，`Merge pull request #62`；`Cargo.toml` 版本 1.1.0）。此前参考 `9b5e570` |
| Release | 暂无发布标签 |
| 工具链 | 仓库 pin **Rust 1.98.0**，另需 CMake；macOS 产物 `Rinx.app`，可执行文件 `rinx` |
| 兼容性 | 保留 `rs.robius.robrix.*` Matrix 事件类型，网页卡片 / 小程序 / 文章与 robrix2 互通；登录回调 `rinx://login` |
| 宿主能力（官网口径） | 网页卡片（分享 HTTP(S) 地址，页面**不会**因此获得聊天记录或账号权限）+ 原生文章编辑器；新增原生小程序需扩展并构建宿主 |

## 2. 本作品与宿主的关系

- 本仓是**静态网页小程序**，不依赖 Rinx 构建，也**没有**调用 Rinx 的授权卡或任何宿主 API。
- **已实测网页卡片（URL 卡片）**：2026-10-04 在 Linux 上构建运行 Rinx `f18869e`，通过「Share mini app」分享 https://bob0627.github.io/gosim-intent-cabin/ ，卡片可在聊天中显示、点开，并经 Open in browser 打开作品页（Linux 版 Rinx 不内嵌网页）。见 `docs/rinx-url-card.md`。
- 晋级后再评估：用 Rinx 宿主授权卡替换页内「确认 / 拒绝」，并把写入适配器从 `IcsFileAdapter` 换成宿主日历能力。

## 3. 本机（Linux agent box）可行性

| 检查 | 状态 |
|---|---|
| OS | Debian 13 (trixie) · x86_64 · X11 桌面（Mesa llvmpipe 软件 OpenGL 4.5） |
| 工具链 | rustup 安装 Rust 1.98.0（按 Rinx `rust-toolchain.toml`） |
| 系统依赖 | Rinx 上游文档列出的 `libssl-dev cmake llvm clang libclang-dev libsqlite3-dev pkg-config binfmt-support libxcursor-dev libx11-dev libasound2-dev libpulse-dev libwayland-dev libxkbcommon-dev`，另需 **`libdrm-dev`**（否则链接报 `unable to find library -ldrm`） |
| 构建 | `cargo build --locked --release` 首次约 12 分钟（8 核） |
| Matrix 服务器 | 本机临时 Synapse 1.162.0（只监听 127.0.0.1，本地测试账号） |

**结论（2026-10-04）：** Rinx 可在本机构建并运行，网页卡片分享 / 显示 / 打开已实测，见 `docs/rinx-url-card.md`。

> 2026-10-03 及以前的记录：当时本机未装 1.98.0 工具链与 cmake/clang，只跑网页 Demo 与无头浏览器截图，未构建 Rinx。

## 4. 历史记录：robrix2（2026-09-23）

| 项 | 结果 |
|---|---|
| 命令 | `git clone --depth 1 https://github.com/OctoSense-org/robrix2.git robrix2-ref`（只读参考） |
| HEAD | `da375f2`（`Merge pull request #332 from Project-Robius-China/fix/e2e-custom-message-preview`） |
| 工具链 | 当时 pin Rust 1.97.1 |
| 备注 | 当时 shallow 树无 `lab/article-editor` 目录；原生示例需按官网钉定提交另取 |
