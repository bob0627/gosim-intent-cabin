/**
 * 训练日程意图舱 · v1 Demo
 * 闭环：样例意图 → 提案卡 → 确认/修改/拒绝 → localStorage 写入 → 核验
 * 失败态：拒绝授权、提案过期
 * 数据：练习数据（非真实日历）
 */
(function () {
  "use strict";

  const STORAGE_KEY = "gosim-intent-cabin-v1";
  const PROPOSAL_TTL_MS = 90 * 1000; // 演示用：90 秒过期（可点「强制过期」立刻触发）

  /** 样例意图（写死，模拟教练消息 / 自述） */
  const SAMPLE_INTENT = {
    id: "intent-reschedule-thu",
    source: "即时消息（练习数据）",
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

  let schedule = null;
  let state = null;
  let expireTimer = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function nowLabel() {
    return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {
      phase: "idle", // idle | proposed | confirmed | rejected | expired
      events: null,
      proposal: null,
      proposalExpiresAt: null,
      audit: [],
      lastResult: null,
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function pushAudit(msg, kind) {
    state.audit.unshift({ t: nowLabel(), msg, kind: kind || "info" });
    if (state.audit.length > 30) state.audit.length = 30;
    saveState();
    renderAudit();
  }

  function setPhase(phase) {
    state.phase = phase;
    saveState();
    renderSteps();
  }

  function cloneEvents() {
    return JSON.parse(JSON.stringify(schedule.events));
  }

  function getWorkingEvents() {
    return state.events || cloneEvents();
  }

  function findEvent(id) {
    return getWorkingEvents().find((e) => e.id === id);
  }

  function findConflict(date, start, end, excludeId) {
    const events = getWorkingEvents();
    return events.find((e) => {
      if (e.id === excludeId) return false;
      if (e.date !== date) return false;
      return !(end <= e.start || start >= e.end);
    });
  }

  /** 规则解析：匹配「周四」「间歇」→ 提案卡；若与已有课冲突则自动建议避让时段 */
  function parseIntentToProposal() {
    const text = SAMPLE_INTENT.text;
    const hits = [];
    if (/周四|星期四/.test(text)) hits.push("识别到目标日：周四");
    if (/间歇/.test(text)) hits.push("识别到课型：间歇跑");
    if (/周五|星期五/.test(text)) hits.push("识别到新日：周五");
    if (/18:00|18：00/.test(text)) hits.push("识别到教练建议开始：18:00");
    if (/19:15|19：15/.test(text)) hits.push("识别到教练建议结束：19:15");

    const proposal = {
      ...DEFAULT_PROPOSAL,
      parseHits: hits,
      createdAt: Date.now(),
    };

    // 若教练原建议与现有日程冲突，Agent 自动给出避让建议（演示人机协作）
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
    if (!schedule) return;
    if (!state.events) state.events = cloneEvents();

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

    const conflict = findConflict(p.proposedDate, p.proposedStart, p.proposedEnd, p.targetEventId);
    if (conflict) {
      const msg = `冲突：与「${conflict.title}」（${conflict.start}–${conflict.end}）时间重叠，未写入`;
      state.lastResult = { ok: false, kind: "write_fail", message: msg, at: nowLabel() };
      pushAudit(msg, "fail");
      renderResult();
      return;
    }

    // 执行写操作（练习数据 → localStorage）
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
    state.lastResult = {
      ok: true,
      kind: "confirmed",
      message: `已将「${before.title}」从 ${before.weekday} ${before.start}–${before.end} 改为 ${p.proposedWeekday} ${p.proposedStart}–${p.proposedEnd}`,
      at: nowLabel(),
      eventId: p.targetEventId,
    };
    setPhase("confirmed");
    pushAudit("用户确认授权 → 写入本地日程（练习数据）", "ok");
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
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    state.events = cloneEvents();
    pushAudit("重置 Demo：恢复练习日程", "info");
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
        if (state.phase === "rejected" && i === 2) cls += " active";
        if (state.phase === "expired" && i === 2) cls += " active";
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
    const events = getWorkingEvents().slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
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
          : `<span class="meta">${e.type} · ${e.location}</span>`;
        return `<li class="${highlight}">
          <span class="day">${e.weekday}</span>
          <span><strong>${e.title}</strong><br>${tag}</span>
          <span class="mono">${e.date}<br>${e.start}–${e.end}</span>
        </li>`;
      })
      .join("");
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
    const target = findEvent(p.targetEventId) || schedule.events.find((e) => e.id === p.targetEventId);

    $("#parse-hits").innerHTML = (p.parseHits || [])
      .map((h) => `<li>${h}</li>`)
      .join("");

    if (target) {
      $("#old-title").textContent = target._rescheduledFrom
        ? `${target.title}（已改期，提案快照）`
        : target.title;
      // 提案对比用原始或当前
      const old =
        state.phase === "confirmed" && target._rescheduledFrom
          ? target._rescheduledFrom
          : { weekday: target.weekday, date: target.date, start: target.start, end: target.end };
      // When proposing, show current event as old
      const showOld =
        state.phase === "proposed"
          ? { weekday: target.weekday, date: target.date, start: target.start, end: target.end, title: target.title }
          : state.phase === "confirmed" && target._rescheduledFrom
            ? { ...target._rescheduledFrom, title: target.title }
            : { weekday: target.weekday, date: target.date, start: target.start, end: target.end, title: target.title };

      $("#old-when").textContent = `${showOld.weekday} ${showOld.date} · ${showOld.start}–${showOld.end}`;
      $("#old-title").textContent = showOld.title || target.title;
    }

    $("#new-when").textContent = `${p.proposedWeekday} ${p.proposedDate} · ${p.proposedStart}–${p.proposedEnd}`;
    $("#new-reason").textContent = p.reason || "";

    const conflict = findConflict(p.proposedDate, p.proposedStart, p.proposedEnd, p.targetEventId);
    const conflictEl = $("#conflict-alert");
    if (conflict && state.phase === "proposed") {
      conflictEl.className = "alert warn";
      conflictEl.textContent = `⚠ 可能冲突：同日已有「${conflict.title}」${conflict.start}–${conflict.end}。请修改时间后再确认。`;
      conflictEl.classList.remove("hidden");
    } else {
      conflictEl.classList.add("hidden");
    }

    // status pill
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

    // TTL
    const ttl = $("#ttl-info");
    if (state.phase === "proposed" && state.proposalExpiresAt) {
      const left = Math.max(0, Math.ceil((state.proposalExpiresAt - Date.now()) / 1000));
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
  }

  function renderResult() {
    const el = $("#result-panel");
    if (!state.lastResult) {
      el.innerHTML = `<p class="muted">尚未执行。请先生成提案并确认 / 拒绝，或演示过期失败态。</p>`;
      return;
    }
    const r = state.lastResult;
    const cls = r.ok ? "ok" : "danger";
    el.innerHTML = `
      <div class="alert ${cls}">
        <strong>${r.ok ? "✓ 核验通过" : "✗ 失败态"}</strong><br>
        ${r.message}<br>
        <span class="muted">${r.at} · kind=${r.kind}</span>
      </div>`;
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

  function renderAll() {
    renderSteps();
    renderIntent();
    renderSchedule();
    renderProposal();
    renderResult();
    renderAudit();
    $("#btn-parse").disabled = state.phase === "proposed";
  }

  async function boot() {
    try {
      const res = await fetch("data/schedule.json");
      schedule = await res.json();
    } catch (e) {
      // file:// 可能拦 fetch：内嵌兜底
      schedule = {
        version: 1,
        note: "内嵌兜底练习数据",
        events: [
          { id: "evt-mon-run", title: "轻松跑 8km", date: "2026-09-28", weekday: "周一", start: "07:00", end: "08:00", type: "有氧", location: "公园跑道" },
          { id: "evt-wed-strength", title: "力量日 · 下肢", date: "2026-09-30", weekday: "周三", start: "18:30", end: "19:45", type: "力量", location: "健身房" },
          { id: "evt-thu-intervals", title: "间歇跑 6×800m", date: "2026-10-01", weekday: "周四", start: "07:00", end: "08:15", type: "间歇", location: "田径场" },
          { id: "evt-fri-recovery", title: "恢复骑行 40min", date: "2026-10-02", weekday: "周五", start: "18:00", end: "18:50", type: "恢复", location: "室内单车" },
          { id: "evt-sat-hyrox", title: "HYROX 模拟课", date: "2026-10-03", weekday: "周六", start: "09:00", end: "11:00", type: "专项", location: "训练营" },
        ],
      };
      console.warn("fetch schedule.json failed, using embedded fallback", e);
    }

    state = loadState();
    if (!state.events) state.events = cloneEvents();

    $("#btn-parse").addEventListener("click", createProposal);
    $("#btn-confirm").addEventListener("click", confirmProposal);
    $("#btn-reject").addEventListener("click", rejectProposal);
    $("#btn-expire").addEventListener("click", forceExpire);
    $("#btn-reset").addEventListener("click", resetDemo);
    $("#btn-apply-edit").addEventListener("click", applyEditsPreview);

    renderAll();
    if (state.phase === "proposed") startExpireWatch();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
