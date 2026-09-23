# env-notes · robrix2 本机环境（2026-09-23 CST）

## Clone

| 项 | 结果 |
|---|---|
| 命令 | `git clone --depth 1 https://github.com/OctoSense-org/robrix2.git robrix2-ref` |
| 结果 | **成功** |
| HEAD | `da375f2`（`Merge pull request #332 from Project-Robius-China/fix/e2e-custom-message-preview`） |
| 用途 | **只读参考**；v1 Demo 不依赖本机构建 |

上游亦可指向 `Project-Robius-China/robrix2`（README 中的安装器与发布说明）。

## README 要点（摘录）

- Robrix：Rust + Makepad 的 Matrix 客户端（Project Robius）。  
- 桌面构建：安装 Rust → `cmake` 等依赖 → `cargo run --release`。  
- Linux（Debian 系）依赖示例：  
  `libssl-dev cmake llvm clang libclang-dev libsqlite3-dev pkg-config binfmt-support libxcursor-dev libx11-dev libasound2-dev libpulse-dev libwayland-dev libxkbcommon-dev`  
- 预构建安装器：`robrix-installer.sh` / Homebrew cask / npm wrapper（见上游 README）。  
- Toolchain pin：`rust-toolchain.toml` → **channel `1.97.1`**。  
- 当前 shallow 树 **无** `lab/article-editor` 目录（计划书中的 `05daf9b…` 路径需另检历史 commit / 发布包；勿假定 HEAD 自带该 lab）。

## 本机（Linux box）可行性

| 检查 | 状态 |
|---|---|
| OS | Debian 13 (trixie) · x86_64 · **无桌面 GUI 会话**（agent box） |
| `rustc` | 有，**1.85.1**（系统包）——低于上游 pin **1.97.1** |
| `cargo` | 有 |
| `cmake` / `clang` | **未安装** |
| X11 / Wayland 开发库 | 部分运行库在；**缺** README 所列完整 `-dev` 套件 |
| GUI 运行 | 即便编译通过，本环境也**不适合**交互跑 Makepad 桌面端 |

**结论：**  
- Clone 与读文档：**可行**。  
- 完整 `cargo run --release`：**当前不建议硬编译**（缺 cmake/clang/完整 GUI 依赖 + toolchain 版本不匹配 + 无显示）。  
- 初赛 v1：**网页 Demo 主路径**（本仓）；等 9/24 官方发布包 / 有 GUI 的机器再钉构建。  
- 备份：预构建 installer（有桌面的参赛机）或 Idea C（hagency）若 A 宿主路径卡死。

## 未执行

- 未跑 `cargo build` / `cargo run`（避免在无 GUI、缺依赖环境空耗）。  
- 未 `gh` 登录、未推远程。
