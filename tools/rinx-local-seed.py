#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Seed a LOCAL test Matrix homeserver for the Rinx URL-card check.

Creates a room "HYROX 训练营" between two local test accounts (coach -> demo),
posts the practice coach message, and optionally (--send-card) posts the same
mini-app card event that Rinx's "Share mini app" form produces.

Accounts must already exist on the local homeserver (e.g. Synapse
`register_new_matrix_user`). Passwords come from env vars; nothing is stored.

  HS=http://127.0.0.1:8008 COACH_PASSWORD=... DEMO_PASSWORD=... \
    python3 tools/rinx-local-seed.py [--send-card]
"""
import json, os, sys, urllib.request, uuid

HS = os.environ.get("HS", "http://127.0.0.1:8008").rstrip("/")
URL = "https://bob0627.github.io/gosim-intent-cabin/"
TITLE = "训练日程意图舱 · Agentic 改期卡"


def req(method, path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode() if body is not None else None
    with urllib.request.urlopen(urllib.request.Request(HS + path, data, headers, method=method)) as r:
        return json.load(r)


def login(user, password):
    return req("POST", "/_matrix/client/v3/login", {
        "type": "m.login.password",
        "identifier": {"type": "m.id.user", "user": user},
        "password": password,
    })["access_token"]


def main():
    coach = login(os.environ.get("COACH_USER", "coach"), os.environ["COACH_PASSWORD"])
    demo_user = os.environ.get("DEMO_USER", "demo")
    demo = login(demo_user, os.environ["DEMO_PASSWORD"])
    demo_id = req("GET", "/_matrix/client/v3/account/whoami", token=demo)["user_id"]
    room = req("POST", "/_matrix/client/v3/createRoom",
               {"name": "HYROX 训练营", "preset": "private_chat", "invite": [demo_id]}, coach)["room_id"]
    req("POST", f"/_matrix/client/v3/join/{room}", {}, demo)

    def send(content, token):
        return req("PUT", f"/_matrix/client/v3/rooms/{room}/send/m.room.message/{uuid.uuid4().hex}",
                   content, token)["event_id"]

    send({"msgtype": "m.text",
          "body": "周四早上田径场有校队占用，间歇跑改到周五傍晚 18:00–19:15 吧，强度不变。收到请改日程。"}, coach)
    if "--send-card" in sys.argv:
        # Same shape as Rinx WebMiniApp::message() (src/mini_app.rs, msgtype rs.robius.robrix.mini_app).
        send({"msgtype": "rs.robius.robrix.mini_app",
              "body": f"[Mini app] {TITLE}\n{URL}",
              "mini_app": {"version": 1, "title": TITLE, "url": URL}}, coach)
    print(room)


if __name__ == "__main__":
    main()
