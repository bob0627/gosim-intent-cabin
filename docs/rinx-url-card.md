# 在 Rinx 中以网页卡片打开 · 复现记录

> 实测时间：2026-10-04 17:28–17:35（北京时间）· 实测环境：作者的 Linux 开发机（Debian 13，X11 桌面）

## 结论（集成到哪一层）

| 项 | 状态 |
|---|---|
| Rinx 版本 | [hagency-org/Rinx](https://github.com/hagency-org/Rinx) `main` @ `f18869e4674fb8ffb666b424879ab820d114e432`（2026-10-04 14:22 北京时间），`Cargo.toml` 版本 1.1.0，`cargo build --locked --release`（默认 features，Rust 1.98.0） |
| 运行平台 | Debian 13 x86_64 · X11 桌面（Mesa llvmpipe 软件渲染） |
| 卡片如何产生 | Rinx 聊天输入栏 **⊕ → Share mini app**，填写网址与标题后发送；Rinx 发出 `msgtype: rs.robius.robrix.mini_app` 的 Matrix 消息（实收内容见 [`evidence/rinx-mini-app-event.json`](evidence/rinx-mini-app-event.json)） |
| 卡片显示 | 聊天时间线中显示为「Mini app」卡片：标题 + 来源 `https://bob0627.github.io` |
| 点开卡片 | Rinx 打开小程序面板（标题、Shared link、Back / Reload / Open in browser / Share） |
| 页面在哪里渲染 | **Linux 上 Rinx 不内嵌网页**，面板提示 “Use Open in browser to view this mini app on this platform.”；点 **Open in browser** 后由系统浏览器打开本作品页面。按 Rinx 源码（`src/mini_app.rs`），只有 macOS / iOS 会在面板内用系统 WebKit 内嵌显示；**本作品未在 macOS / iOS 上实测内嵌效果** |
| 宿主能力 | 页面**没有**获得聊天记录、账号或任何 Rinx API；授权卡仍是页面内的「确认 / 拒绝」，**未接 Rinx 宿主授权卡** |
| Matrix 服务器 | 本机临时 Synapse 1.162.0（`server_name: localhost`，只监听 127.0.0.1，支持 Rinx 需要的 native Sliding Sync）；两个本地测试账号 `@coach:localhost`、`@demo:localhost`，不涉及任何真实账号 |

## 截图

| # | 内容 | 文件 |
|---|---|---|
| 0 | Rinx 群聊中的教练改期消息（2026-10-04 22:17 补拍，用于视频） | [`screenshots/rinx-00-coach-message.png`](screenshots/rinx-00-coach-message.png) |
| 1 | Rinx「Share mini app」表单：网址 + 标题，发往「HYROX 训练营」 | [`screenshots/rinx-01-share-mini-app.png`](screenshots/rinx-01-share-mini-app.png) |
| 2 | 聊天中：教练改期消息 + 作品的 Mini app 卡片 | [`screenshots/rinx-02-card-in-chat.png`](screenshots/rinx-02-card-in-chat.png) |
| 3 | 点开卡片后的 Rinx 小程序面板（Linux：提示用 Open in browser） | [`screenshots/rinx-03-card-opened.png`](screenshots/rinx-03-card-opened.png) |
| 4 | 点 Open in browser 后，系统浏览器打开 https://bob0627.github.io/gosim-intent-cabin/ | [`screenshots/rinx-04-open-in-browser.png`](screenshots/rinx-04-open-in-browser.png) |

## 复现步骤（Linux）

```bash
# 1. 构建 Rinx（Debian/Ubuntu 依赖见 Rinx 的 docs/robrix-upstream-readme.md；本机另需 libdrm-dev 才能链接）
git clone https://github.com/hagency-org/Rinx && cd Rinx
git checkout f18869e4674fb8ffb666b424879ab820d114e432
cargo build --locked --release            # rust-toolchain.toml 自动用 Rust 1.98.0

# 2. 本地测试用 Matrix 服务器（任意支持 native Sliding Sync 的服务器均可，这里用 Synapse）
python3 -m venv venv && ./venv/bin/pip install matrix-synapse
./venv/bin/python -m synapse.app.homeserver --server-name localhost \
  --config-path homeserver.yaml --generate-config --report-stats=no
./venv/bin/python -m synapse.app.homeserver -c homeserver.yaml &
./venv/bin/register_new_matrix_user -c homeserver.yaml -u coach -p '<测试密码1>' --no-admin http://127.0.0.1:8008
./venv/bin/register_new_matrix_user -c homeserver.yaml -u demo  -p '<测试密码2>' --no-admin http://127.0.0.1:8008

# 3. 建群并发教练消息（本仓 tools/rinx-local-seed.py；加 --send-card 则由教练账号直接发卡片）
HS=http://127.0.0.1:8008 COACH_PASSWORD='<测试密码1>' DEMO_PASSWORD='<测试密码2>' \
  python3 tools/rinx-local-seed.py

# 4. 启动 Rinx 并登录 demo（也可以在登录页手动填写 homeserver http://127.0.0.1:8008）
./target/release/rinx @demo:localhost '<测试密码2>' http://127.0.0.1:8008
```

在 Rinx 中：打开「HYROX 训练营」→ 输入栏 **⊕ → Share mini app** → Web address 填 `https://bob0627.github.io/gosim-intent-cabin/`，Card title 填 `训练日程意图舱 · Agentic 改期卡` → **Send** → 点聊天中的卡片 → **Open in browser**。

## 已知现象

- 由脚本（教练账号）直接发出的卡片，在 demo 端时间线上发送者一栏曾显示 `<Username not available>`，卡片本身可正常点开；截图 2 使用的是在 Rinx 内通过 Share mini app 发出的卡片。
- 本记录只证明「URL 卡片」这一层：分享、显示、点开、跳转到作品页面。日程改期闭环仍在网页内完成，与在普通浏览器中打开相同。
