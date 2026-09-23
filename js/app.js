/**
 * 训练日程意图舱 · v1.1 / Step2（帝王蟹意向 · ICS 能力）
 * 闭环：意图 → 提案卡 → 确认/修改/拒绝 → 写回
 *   - 练习 JSON 模式：localStorage
 *   - ICS 真日历模式：解析 data/hyrox-training.ics → 确认后生成更新 ICS 可下载
 * 失败态：拒绝、过期、写冲突
 * 未接：系统 Calendar.app API、robrix2 宿主授权卡
 */
(function () {
  "use strict";

  const STORAGE_KEY = "gosim-intent-cabin-v1.1";
  const MODE_KEY = "gosim-intent-cabin-mode";
  const PROPOSAL_TTL_MS = 90 * 1000;
  const ICS_PATH = "data/hyrox-training.ics";
  const JSON_PATH = "data/schedule.json";

  const SAMPLE_INTENT = {
    id: "intent-reschedule-thu",
    source: "即时消息（练习入口 · 样例）",
    from: "教练小周",
    text:
      "周四早上田径场有校队占用，间歇跑改到周五傍晚 18:00–19:15 吧，强度不变。收到请改日程。",
    receivedAt: "2026-09-23T09:12:00+08:00",
  };

  const DEFAULT_PROPOSAL = {
    targetEventId: "evt-thu-intervals",
    proposedDate: "2026-10-02",
    proposedWeekday: "周五",
    proposedStart: "18:00",
    proposedEnd: "19:15",
    reason: "田径场校队占用 · 教练通知改期",
  };

  /** @type {'ics'|'json'} */
  let mode = "ics";
  let scheduleMeta = { version: "1.1", source: ICS_PATH };
  /** 权威事件列表（当前模式的工作副本基线） */
  let baselineEvents = [];
  let state = null;
  let expireTimer = null;
  /** 最近一次序列化的 ICS 文本（确认后可下载） */
  let lastIcsText = null;

  const $ = (sel) => document.querySelector(sel);

  function nowLabel() {
    return new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });
  }

  function loadMode() {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === "json" || m === "ics") return m;
    } catch (_) {}
    return "ics";
  }

  function saveMode() {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch (_) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return blankState();
  }

  function blankState() {
    return {
      phase: "idle",
      events: null,
      proposal: null,
      proposalExpiresAt: null,
      audit: [],
      lastResult: null,
      modeAtSave: mode,
    };
  }

  function saveState() {
    state.modeAtSave = mode;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function pushAudit(msg, kind) {
    state.audit.unshift({ t: nowLabel(), msg, kind: kind || "info" });
    if (state.audit.length > 40) state.audit.length = 40;
    saveState();
    renderAudit();
  }

  function setPhase(phase) {
    state.phase = phase;
    saveState();
    renderSteps();
  }

  function cloneEvents(list) {
    return JSON.parse(JSON.stringify(list || baselineEvents));
  }

  function getWorkingEvents() {
    return state.events || cloneEvents();
  }

  function findEvent(id) {
    return getWorkingEvents().find((e) => e.id === id);
  }

  function findConflict(date, start, end, excludeId) {
    return getWorkingEvents().find((e) => {
      if (e.id === excludeId) return false;
      if (e.date !== date) return false;
      return !(end <= e.start || start >= e.end);
    });
  }

  function getIntentText() {
    const custom = ($("#intent-paste") && $("#intent-paste").value.trim()) || "";
    return custom || SAMPLE_INTENT.text;
  }

  function parseIntentToProposal() {
    const text = getIntentText();
    const hits = [];
    if (/周四|星期四/.test(text)) hits.push("识别到目标日：周四");
    if (/间歇/.test(text)) hits.push("识别到课型：间歇跑");
    if (/周五|星期五/.test(text)) hits.push("识别到新日：周五");
    if (/18:00|18：00/.test(text)) hits.push("识别到教练建议开始：18:00");
    if (/19:15|19：15/.test(text)) hits.push("识别到教练建议结束：19:15");
    if (!hits.length) hits.push("未命中关键词，使用默认改期提案（练习规则）");

    const proposal = {
      ...DEFAULT_PROPOSAL,
      parseHits: hits,
      createdAt: Date.now(),
      intentSnippet: text.slice(0, 120),
    };

    const conflict = findConflict(
      proposal.proposedDate,
      proposal.proposedStart,
      proposal.proposedEnd,
      proposal.targetEventId
    );
    if (conflict) {
      proposal.proposedStart = "19:30";
      proposal.proposedEnd = "20:45";
      proposal.reason =
        DEFAULT_PROPOSAL.reason +
        `；已避让「${conflict.title}」${conflict.start}–${conflict.end}`;
      hits.push(
        `检测到冲突「${conflict.title}」，自动建议改为 19:30–20:45（可改回）`
      );
    }
    return proposal;
  }

  function startExpireWatch() {
    clearExpireWatch();
    if (state.phase !== "proposed" || !state.proposalExpiresAt) return;
    const tick = () => {
      if (state.phase !== "proposed") return;
      if (Date.now() >= state.proposalExpiresAt) {
        expireProposal("提案已过期（未在有效期内确认）");
      } else {
        renderProposal();
      }
    };
    expireTimer = setInterval(tick, 1000);
    tick();
  }

  function clearExpireWatch() {
    if (expireTimer) {
      clearInterval(expireTimer);
      expireTimer = null;
    }
  }

  function expireProposal(reason) {
    clearExpireWatch();
    state.proposal = state.proposal || {};
    state.lastResult = {
      ok: false,
      kind: "expired",
      message: reason,
      at: nowLabel(),
    };
    setPhase("expired");
    pushAudit(reason, "fail");
    renderAll();
  }

  function createProposal() {
    if (!baselineEvents.length) return;
    if (!state.events) state.events = cloneEvents();

    const target = findEvent(DEFAULT_PROPOSAL.targetEventId);
    if (!target) {
      pushAudit(
        "解析失败：当前日程中找不到目标事件 evt-thu-intervals（间歇跑）。请导入含该 UID 的 ICS，或切回默认源。",
        "fail"
      );
      return;
    }

    const proposal = parseIntentToProposal();
    state.proposal = proposal;
    state.proposalExpiresAt = Date.now() + PROPOSAL_TTL_MS;
    state.lastResult = null;
    setPhase("proposed");
    pushAudit("Agent 解析意图 → 生成改期提案卡", "info");
    pushAudit(
      `提案有效期约 ${Math.round(PROPOSAL_TTL_MS / 1000)} 秒（演示加速；可点「强制过期」）`,
      "info"
    );
    renderAll();
    startExpireWatch();
  }

  function confirmProposal() {
    if (state.phase !== "proposed") return;
    if (Date.now() >= state.proposalExpiresAt) {
      expireProposal("确认时提案已过期");
      return;
    }

    const p = collectEditedProposal();
    const target = findEvent(p.targetEventId);
    if (!target) {
      pushAudit("写失败：找不到目标事件", "fail");
      return;
    }

    const conflict = findConflict(
      p.proposedDate,
      p.proposedStart,
      p.proposedEnd,
      p.targetEventId
    );
    if (conflict) {
      const msg = `冲突：与「${conflict.title}」（${conflict.start}–${conflict.end}）时间重叠，未写入`;
      state.lastResult = {
        ok: false,
        kind: "write_fail",
        message: msg,
        at: nowLabel(),
      };
      pushAudit(msg, "fail");
      renderResult();
      return;
    }

    const events = getWorkingEvents();
    const idx = events.findIndex((e) => e.id === p.targetEventId);
    const before = { ...events[idx] };
    events[idx] = {
      ...events[idx],
      date: p.proposedDate,
      weekday: p.proposedWeekday,
      start: p.proposedStart,
      end: p.proposedEnd,
      title: events[idx].title,
      uid: events[idx].uid || `${events[idx].id}@gosim-intent-cabin`,
      _rescheduledFrom: {
        date: before.date,
        weekday: before.weekday,
        start: before.start,
        end: before.end,
      },
    };
    state.events = events;
    state.proposal = p;
    clearExpireWatch();

    if (mode === "ics") {
      lastIcsText = window.CalendarIcs.serializeIcs(
        window.CalendarIcs.ensureUids(events),
        { calName: "HYROX 训练周程（已改期）" }
      );
    } else {
      lastIcsText = null;
    }

    const writeLayer =
      mode === "ics"
        ? "已更新内存日程并生成 ICS（可下载核验）"
        : "已写入 localStorage（练习 JSON）";

    state.lastResult = {
      ok: true,
      kind: "confirmed",
      message: `已将「${before.title}」从 ${before.weekday} ${before.start}–${before.end} 改为 ${p.proposedWeekday} ${p.proposedStart}–${p.proposedEnd} · ${writeLayer}`,
      at: nowLabel(),
      eventId: p.targetEventId,
    };
    setPhase("confirmed");
    pushAudit(
      mode === "ics"
        ? "用户确认授权 → 写回 ICS 能力层（UID 稳定 · DTSTART/DTEND 已更新）"
        : "用户确认授权 → 写入本地日程（练习 JSON / localStorage）",
      "ok"
    );
    pushAudit(state.lastResult.message, "ok");
    renderAll();
  }

  function rejectProposal() {
    if (state.phase !== "proposed") return;
    clearExpireWatch();
    state.lastResult = {
      ok: false,
      kind: "rejected",
      message: "用户拒绝授权：未修改任何日程",
      at: nowLabel(),
    };
    setPhase("rejected");
    pushAudit("用户拒绝授权 → 失败态（日程未变）", "fail");
    renderAll();
  }

  function forceExpire() {
    if (state.phase !== "proposed") return;
    state.proposalExpiresAt = Date.now() - 1;
    expireProposal("已强制过期（演示失败态）");
  }

  function resetDemo() {
    clearExpireWatch();
    lastIcsText = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    state = blankState();
    state.events = cloneEvents();
    pushAudit(
      mode === "ics"
        ? "重置 Demo：恢复 ICS 基线日程"
        : "重置 Demo：恢复练习 JSON 日程",
      "info"
    );
    renderAll();
  }

  function collectEditedProposal() {
    const base = state.proposal || DEFAULT_PROPOSAL;
    return {
      ...base,
      proposedDate: $("#edit-date").value || base.proposedDate,
      proposedWeekday: $("#edit-weekday").value || base.proposedWeekday,
      proposedStart: $("#edit-start").value || base.proposedStart,
      proposedEnd: $("#edit-end").value || base.proposedEnd,
      targetEventId: base.targetEventId,
    };
  }

  function applyEditsPreview() {
    if (state.phase !== "proposed") return;
    state.proposal = collectEditedProposal();
    saveState();
    renderProposal();
    pushAudit("用户修改了提案时间（待确认）", "info");
  }

  function downloadUpdatedIcs() {
    if (!window.CalendarIcs) return;
    const events = window.CalendarIcs.ensureUids(getWorkingEvents());
    const text =
      lastIcsText ||
      window.CalendarIcs.serializeIcs(events, {
        calName: "HYROX 训练周程（导出）",
      });
    window.CalendarIcs.downloadIcs("hyrox-training-updated.ics", text);
    pushAudit("已下载 ICS：hyrox-training-updated.ics（可拖入 Apple 日历核验）", "ok");
  }

  async function onImportIcs(file) {
    if (!file) return;
    try {
      const events = await window.CalendarIcs.parseIcsFile(file);
      if (!events.length) {
        pushAudit("导入失败：ICS 中未解析到 VEVENT", "fail");
        return;
      }
      baselineEvents = window.CalendarIcs.ensureUids(events);
      scheduleMeta = { version: "1.1", source: "user-import:" + file.name };
      clearExpireWatch();
      lastIcsText = null;
      state = blankState();
      state.events = cloneEvents();
      mode = "ics";
      saveMode();
      pushAudit(
        `已导入并解析 ICS「${file.name}」→ ${events.length} 个事件（真解析）`,
        "ok"
      );
      renderAll();
      updateModeUi();
    } catch (err) {
      pushAudit("导入 ICS 失败：" + (err && err.message ? err.message : err), "fail");
    }
  }

  async function loadIcsBaseline() {
    const res = await fetch(ICS_PATH);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    const events = window.CalendarIcs.parseIcs(text);
    if (!events.length) throw new Error("ICS 无 VEVENT");
    baselineEvents = window.CalendarIcs.ensureUids(events);
    scheduleMeta = { version: "1.1", source: ICS_PATH };
    lastIcsText = text;
    return events;
  }

  async function loadJsonBaseline() {
    const res = await fetch(JSON_PATH);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    baselineEvents = window.CalendarIcs.ensureUids(data.events || []);
    scheduleMeta = { version: data.version || 1, source: JSON_PATH };
    lastIcsText = null;
    return baselineEvents;
  }

  function embeddedJsonFallback() {
    baselineEvents = window.CalendarIcs.ensureUids([
      {
        id: "evt-mon-run",
        title: "轻松跑 8km",
        date: "2026-09-28",
        weekday: "周一",
        start: "07:00",
        end: "08:00",
        type: "有氧",
        location: "公园跑道",
      },
      {
        id: "evt-wed-strength",
        title: "力量日 · 下肢",
        date: "2026-09-30",
        weekday: "周三",
        start: "18:30",
        end: "19:45",
        type: "力量",
        location: "健身房",
      },
      {
        id: "evt-thu-intervals",
        title: "间歇跑 6×800m",
        date: "2026-10-01",
        weekday: "周四",
        start: "07:00",
        end: "08:15",
        type: "间歇",
        location: "田径场",
      },
      {
        id: "evt-fri-recovery",
        title: "恢复骑行 40min",
        date: "2026-10-02",
        weekday: "周五",
        start: "18:00",
        end: "18:50",
        type: "恢复",
        location: "室内单车",
      },
      {
        id: "evt-sat-hyrox",
        title: "HYROX 模拟课",
        date: "2026-10-03",
        weekday: "周六",
        start: "09:00",
        end: "11:00",
        type: "专项",
        location: "训练营",
      },
    ]);
    scheduleMeta = { version: "1.1", source: "embedded-fallback" };
  }

  function embeddedIcsFallback() {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:evt-mon-run@gosim-intent-cabin",
      "DTSTART;TZID=Asia/Shanghai:20260928T070000",
      "DTEND;TZID=Asia/Shanghai:20260928T080000",
      "SUMMARY:轻松跑 8km",
      "DESCRIPTION:type=有氧; location=公园跑道",
      "LOCATION:公园跑道",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:evt-wed-strength@gosim-intent-cabin",
      "DTSTART;TZID=Asia/Shanghai:20260930T183000",
      "DTEND;TZID=Asia/Shanghai:20260930T194500",
      "SUMMARY:力量日 · 下肢",
      "DESCRIPTION:type=力量; location=健身房",
      "LOCATION:健身房",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:evt-thu-intervals@gosim-intent-cabin",
      "DTSTART;TZID=Asia/Shanghai:20261001T070000",
      "DTEND;TZID=Asia/Shanghai:20261001T081500",
      "SUMMARY:间歇跑 6×800m",
      "DESCRIPTION:type=间歇; location=田径场",
      "LOCATION:田径场",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:evt-fri-recovery@gosim-intent-cabin",
      "DTSTART;TZID=Asia/Shanghai:20261002T180000",
      "DTEND;TZID=Asia/Shanghai:20261002T185000",
      "SUMMARY:恢复骑行 40min",
      "DESCRIPTION:type=恢复; location=室内单车",
      "LOCATION:室内单车",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:evt-sat-hyrox@gosim-intent-cabin",
      "DTSTART;TZID=Asia/Shanghai:20261003T090000",
      "DTEND;TZID=Asia/Shanghai:20261003T110000",
      "SUMMARY:HYROX 模拟课",
      "DESCRIPTION:type=专项; location=训练营",
      "LOCATION:训练营",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    baselineEvents = window.CalendarIcs.ensureUids(
      window.CalendarIcs.parseIcs(ics)
    );
    scheduleMeta = { version: "1.1", source: "embedded-ics-fallback" };
    lastIcsText = ics;
  }

  async function switchMode(next) {
    if (next !== "ics" && next !== "json") return;
    if (next === mode && baselineEvents.length) {
      updateModeUi();
      return;
    }
    clearExpireWatch();
    mode = next;
    saveMode();
    try {
      if (mode === "ics") await loadIcsBaseline();
      else await loadJsonBaseline();
    } catch (e) {
      console.warn("mode load failed, fallback", e);
      if (mode === "ics") embeddedIcsFallback();
      else embeddedJsonFallback();
    }
    lastIcsText = mode === "ics" ? lastIcsText : null;
    state = blankState();
    state.events = cloneEvents();
    pushAudit(
      mode === "ics"
        ? `切换到 ICS 真日历模式 · 源 ${scheduleMeta.source} · ${baselineEvents.length} 事件`
        : `切换到练习 JSON 模式 · 源 ${scheduleMeta.source}`,
      "info"
    );
    renderAll();
    updateModeUi();
  }

  // ——— render ———

  function renderSteps() {
    const map = {
      idle: 0,
      proposed: 1,
      confirmed: 2,
      rejected: 2,
      expired: 2,
    };
    const idx = map[state.phase] ?? 0;
    const labels = ["① 输入意图", "② 提案卡 / 授权", "③ 执行与核验"];
    const el = $("#steps");
    el.innerHTML = labels
      .map((lab, i) => {
        let cls = "step";
        if (i < idx) cls += " done";
        if (i === idx) cls += " active";
        if ((state.phase === "rejected" || state.phase === "expired") && i === 2)
          cls += " active";
        return `<span class="${cls}">${lab}</span>`;
      })
      .join("");
  }

  function renderIntent() {
    $("#intent-source").textContent = `${SAMPLE_INTENT.source} · ${SAMPLE_INTENT.from}`;
    $("#intent-text").textContent = SAMPLE_INTENT.text;
    $("#intent-time").textContent = `收到：${SAMPLE_INTENT.receivedAt}（CST）`;
  }

  function renderSchedule() {
    const events = getWorkingEvents()
      .slice()
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const changedId =
      state.phase === "confirmed" && state.lastResult && state.lastResult.ok
        ? state.lastResult.eventId
        : null;
    const ul = $("#event-list");
    ul.className = "event-list" + (changedId ? " changed" : "");
    ul.innerHTML = events
      .map((e) => {
        const highlight = e.id === changedId ? " highlight" : "";
        const tag = e._rescheduledFrom
          ? `<span class="meta">← 原 ${e._rescheduledFrom.weekday} ${e._rescheduledFrom.start}</span>`
          : `<span class="meta">${e.type || "事件"} · ${e.location || ""}</span>`;
        return `<li class="${highlight}">
          <span class="day">${e.weekday}</span>
          <span><strong>${e.title}</strong><br>${tag}</span>
          <span class="mono">${e.date}<br>${e.start}–${e.end}</span>
        </li>`;
      })
      .join("");

    const src = $("#schedule-source");
    if (src) {
      src.innerHTML =
        mode === "ics"
          ? `权威源：<code>${scheduleMeta.source}</code> · RFC5545 ICS 真解析；确认后可下载更新 ICS。`
          : `权威源：<code>${scheduleMeta.source}</code> · 练习 JSON；确认后写回 localStorage。`;
    }
  }

  function renderProposal() {
    const box = $("#proposal-card");
    const actions = $("#proposal-actions");
    const editBox = $("#edit-fields");

    if (state.phase === "idle" || !state.proposal) {
      box.classList.remove("visible");
      actions.classList.add("hidden");
      editBox.classList.add("hidden");
      $("#parse-hits").innerHTML = "";
      return;
    }

    box.classList.add("visible");
    const p = state.proposal;
    const target =
      findEvent(p.targetEventId) ||
      baselineEvents.find((e) => e.id === p.targetEventId);

    $("#parse-hits").innerHTML = (p.parseHits || [])
      .map((h) => `<li>${h}</li>`)
      .join("");

    if (target) {
      const showOld =
        state.phase === "proposed"
          ? {
              weekday: target.weekday,
              date: target.date,
              start: target.start,
              end: target.end,
              title: target.title,
            }
          : state.phase === "confirmed" && target._rescheduledFrom
            ? { ...target._rescheduledFrom, title: target.title }
            : {
                weekday: target.weekday,
                date: target.date,
                start: target.start,
                end: target.end,
                title: target.title,
              };

      $("#old-when").textContent = `${showOld.weekday} ${showOld.date} · ${showOld.start}–${showOld.end}`;
      $("#old-title").textContent = showOld.title || target.title;
    }

    $("#new-when").textContent = `${p.proposedWeekday} ${p.proposedDate} · ${p.proposedStart}–${p.proposedEnd}`;
    $("#new-reason").textContent = p.reason || "";

    const conflict = findConflict(
      p.proposedDate,
      p.proposedStart,
      p.proposedEnd,
      p.targetEventId
    );
    const conflictEl = $("#conflict-alert");
    if (conflict && state.phase === "proposed") {
      conflictEl.className = "alert warn";
      conflictEl.textContent = `⚠ 可能冲突：同日已有「${conflict.title}」${conflict.start}–${conflict.end}。请修改时间后再确认。`;
      conflictEl.classList.remove("hidden");
    } else {
      conflictEl.classList.add("hidden");
    }

    const pill = $("#proposal-status");
    const statusMap = {
      proposed: ["pending", "待授权"],
      confirmed: ["confirmed", "已确认并写入"],
      rejected: ["rejected", "已拒绝"],
      expired: ["expired", "已过期"],
    };
    const [cls, label] = statusMap[state.phase] || ["pending", state.phase];
    pill.className = `status-pill ${cls}`;
    pill.textContent = label;

    const ttl = $("#ttl-info");
    if (state.phase === "proposed" && state.proposalExpiresAt) {
      const left = Math.max(
        0,
        Math.ceil((state.proposalExpiresAt - Date.now()) / 1000)
      );
      ttl.textContent = `提案剩余有效时间：${left}s`;
      ttl.classList.remove("hidden");
    } else {
      ttl.classList.add("hidden");
    }

    const canEdit = state.phase === "proposed";
    actions.classList.toggle("hidden", !canEdit);
    editBox.classList.toggle("hidden", !canEdit);

    if (canEdit) {
      $("#edit-date").value = p.proposedDate;
      $("#edit-weekday").value = p.proposedWeekday;
      $("#edit-start").value = p.proposedStart;
      $("#edit-end").value = p.proposedEnd;
    }

    const confirmBtn = $("#btn-confirm");
    if (confirmBtn) {
      confirmBtn.textContent =
        mode === "ics"
          ? "确认授权 · 写回 ICS"
          : "确认授权 · 写入日程";
    }
  }

  function renderResult() {
    const el = $("#result-panel");
    if (!state.lastResult) {
      el.innerHTML = `<p class="muted">尚未执行。请先生成提案并确认 / 拒绝，或演示过期失败态。</p>`;
      return;
    }
    const r = state.lastResult;
    const cls = r.ok ? "ok" : "danger";
    const icsHint =
      r.ok && mode === "ics"
        ? `<p class="muted" style="margin-top:8px">下一步：点「下载更新后的 ICS」，拖进 Apple 日历核对 DTSTART/DTEND。</p>`
        : "";
    el.innerHTML = `
      <div class="alert ${cls}">
        <strong>${r.ok ? "✓ 核验通过" : "✗ 失败态"}</strong><br>
        ${r.message}<br>
        <span class="muted">${r.at} · kind=${r.kind}</span>
      </div>${icsHint}`;
  }

  function renderAudit() {
    const ul = $("#audit-list");
    if (!state.audit.length) {
      ul.innerHTML = `<li class="muted">暂无记录</li>`;
      return;
    }
    ul.innerHTML = state.audit
      .map((a) => {
        const k = a.kind === "ok" ? "ok" : a.kind === "fail" ? "fail" : "";
        return `<li class="${k}"><span class="t">${a.t}</span><br>${a.msg}</li>`;
      })
      .join("");
  }

  function updateModeUi() {
    const icsBtn = $("#mode-ics");
    const jsonBtn = $("#mode-json");
    if (icsBtn) icsBtn.classList.toggle("active", mode === "ics");
    if (jsonBtn) jsonBtn.classList.toggle("active", mode === "json");
    const icsPanel = $("#ics-tools");
    if (icsPanel) icsPanel.classList.toggle("hidden", mode !== "ics");
    const badge = $("#badge-data");
    if (badge) {
      if (mode === "ics") {
        badge.textContent = "ICS 真日历读写";
        badge.className = "badge ok";
      } else {
        badge.textContent = "练习 JSON · localStorage";
        badge.className = "badge warn";
      }
    }
  }

  function renderAll() {
    renderSteps();
    renderIntent();
    renderSchedule();
    renderProposal();
    renderResult();
    renderAudit();
    updateModeUi();
    const parseBtn = $("#btn-parse");
    if (parseBtn) parseBtn.disabled = state.phase === "proposed";
    const dl = $("#btn-download-ics");
    if (dl) {
      dl.disabled = !(
        mode === "ics" &&
        (state.phase === "confirmed" || getWorkingEvents().length)
      );
    }
  }

  async function boot() {
    mode = loadMode();

    try {
      if (mode === "ics") await loadIcsBaseline();
      else await loadJsonBaseline();
    } catch (e) {
      console.warn("fetch baseline failed, using embedded fallback", e);
      if (mode === "ics") embeddedIcsFallback();
      else embeddedJsonFallback();
    }

    state = loadState();
    // 模式与存档不一致时，以当前模式基线为准（避免串数据）
    if (state.modeAtSave && state.modeAtSave !== mode) {
      state = blankState();
    }
    if (!state.events) state.events = cloneEvents();

    $("#btn-parse").addEventListener("click", createProposal);
    $("#btn-confirm").addEventListener("click", confirmProposal);
    $("#btn-reject").addEventListener("click", rejectProposal);
    $("#btn-expire").addEventListener("click", forceExpire);
    $("#btn-reset").addEventListener("click", resetDemo);
    $("#btn-apply-edit").addEventListener("click", applyEditsPreview);
    $("#mode-ics").addEventListener("click", () => switchMode("ics"));
    $("#mode-json").addEventListener("click", () => switchMode("json"));
    $("#btn-download-ics").addEventListener("click", downloadUpdatedIcs);
    $("#ics-file").addEventListener("change", (ev) => {
      const f = ev.target.files && ev.target.files[0];
      onImportIcs(f);
      ev.target.value = "";
    });
    $("#btn-use-sample").addEventListener("click", () => {
      if ($("#intent-paste")) $("#intent-paste").value = "";
      renderIntent();
      pushAudit("使用样例意图（练习入口）", "info");
    });

    pushAudit(
      mode === "ics"
        ? `启动 · ICS 真日历模式 · 已解析 ${baselineEvents.length} 个 VEVENT`
        : `启动 · 练习 JSON 模式 · ${baselineEvents.length} 个事件`,
      "info"
    );
    renderAll();
    if (state.phase === "proposed") startExpireWatch();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
