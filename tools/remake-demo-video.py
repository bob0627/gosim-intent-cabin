#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Rebuild docs/demo/intent-cabin-demo.mp4 from the v1 web recording + Rinx stills.

  python3 tools/remake-demo-video.py <v1-web-recording.mp4> <out.mp4>

v1 recording: 1280x800, 25 fps, captions baked in (Playwright headless).
Segment 1 (0-4.6 s): v1 opening, its caption covered by a new caption.
Segment 2: Rinx stills docs/screenshots/rinx-00..04 with Chinese captions.
Segment 3: v1 from 4.68 s to the end, unchanged.
Needs ffmpeg (libx264), Pillow and Noto Sans CJK (Bold .ttc).
"""
import os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1280, 800, 25
FONT = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 26, index=2)  # SC
BOX = (16, 24, 40)
CUT_A, CUT_B = 4.6, 4.68
OPENING = ["训练日程意图舱 · OctoSense 场景 03 日历 · 网页小程序",
           "已实测：可在 Rinx 中以网页卡片分享并打开；授权仍在页面内"]
STILLS = [
    ("rinx-00-coach-message.png", ["Rinx 实测（Linux · Rinx f18869e · 本地测试服务器与测试账号）", "教练在群里发来改期消息"], 3.6),
    ("rinx-01-share-mini-app.png", ["在 Rinx 输入栏 ⊕ → Share mini app", "填入作品网址与卡片标题，发送到群"], 3.6),
    ("rinx-02-card-in-chat.png", ["聊天中出现「训练日程意图舱」Mini app 网页卡片"], 3.6),
    ("rinx-03-card-opened.png", ["点开卡片 → Rinx 小程序面板", "Linux 版 Rinx 不内嵌网页，需点 Open in browser"], 3.6),
    ("rinx-04-open-in-browser.png", ["Open in browser → 打开作品页面", "页面拿不到聊天记录或账号；授权仍在页面内完成"], 3.6),
]


def caption(lines, opaque_box=None):
    """Transparent 1280x800 RGBA layer with a centred caption box near the bottom."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if opaque_box:  # hide the v1 caption completely
        d.rounded_rectangle(opaque_box, radius=14, fill=BOX + (255,))
    lh = 36
    widths = [d.textlength(t, font=FONT) for t in lines]
    bw, bh = max(widths) + 56, lh * len(lines) + 28
    y0 = 732 - bh // 2
    if not opaque_box:
        d.rounded_rectangle(((W - bw) // 2, y0, (W + bw) // 2, y0 + bh), radius=14, fill=BOX + (235,))
    for i, (t, w) in enumerate(zip(lines, widths)):
        d.text(((W - w) / 2, y0 + 14 + i * lh), t, font=FONT, fill=(255, 255, 255, 255))
    return img


def run(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def main(src, out):
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    shots = os.path.join(root, "docs", "screenshots")
    enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]
    with tempfile.TemporaryDirectory() as tmp:
        ov = os.path.join(tmp, "open.png")
        caption(OPENING, opaque_box=(110, 676, 1170, 792)).save(ov)
        a = os.path.join(tmp, "a.mp4")
        run("-i", src, "-i", ov, "-t", str(CUT_A), "-filter_complex", "[0:v][1:v]overlay=0:0", *enc, a)
        parts = [a]
        for k, (name, lines, dur) in enumerate(STILLS):
            frame = Image.open(os.path.join(shots, name)).convert("RGBA").resize((W, H))
            frame.alpha_composite(caption(lines))
            png = os.path.join(tmp, f"s{k}.png")
            frame.convert("RGB").save(png)
            mp4 = os.path.join(tmp, f"s{k}.mp4")
            run("-loop", "1", "-t", str(dur), "-i", png, "-vf", "fade=in:st=0:d=0.3", *enc, mp4)
            parts.append(mp4)
        b = os.path.join(tmp, "b.mp4")
        run("-ss", str(CUT_B), "-i", src, *enc, b)
        parts.append(b)
        lst = os.path.join(tmp, "list.txt")
        with open(lst, "w") as f:
            f.writelines(f"file '{p}'\n" for p in parts)
        run("-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
