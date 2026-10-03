/**
 * calendar-ics.js · RFC5545 风格 VEVENT 子集（无外部依赖）
 * 能力：解析 / 序列化 UID · SUMMARY · DTSTART · DTEND · DESCRIPTION · LOCATION
 * 不做：RRULE / VALARM / 系统 Calendar.app / Rinx（原名 robrix2）宿主授权
 */
(function (global) {
  "use strict";

  const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  /** 展开 ICS 行折叠（RFC5545：续行以空白开头） */
  function unfold(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n[ \t]/g, "");
  }

  function unescapeText(s) {
    return String(s || "")
      .replace(/\\n/gi, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");
  }

  function escapeText(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  /**
   * 解析 DTSTART/DTEND 值。
   * 支持：20261001T070000 / 20261001T070000Z / 带 TZID 参数的本地墙钟时间
   * 返回 { date:'YYYY-MM-DD', start|end:'HH:mm', weekday }
   */
  function parseDateTime(paramPart, value) {
    const raw = String(value || "").trim();
    // DATE only: YYYYMMDD
    if (/^\d{8}$/.test(raw)) {
      const y = raw.slice(0, 4);
      const m = raw.slice(4, 6);
      const d = raw.slice(6, 8);
      const date = `${y}-${m}-${d}`;
      return { date, time: "00:00", weekday: weekdayOf(date) };
    }
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/i);
    if (!m) {
      throw new Error("无法解析日期时间: " + raw);
    }
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    const time = `${m[4]}:${m[5]}`;
    return { date, time, weekday: weekdayOf(date) };
  }

  function weekdayOf(isoDate) {
    // 用本地 noon 避免时区偏移导致日错位
    const [y, mo, d] = isoDate.split("-").map(Number);
    const dt = new Date(y, mo - 1, d, 12, 0, 0);
    return WEEKDAYS[dt.getDay()];
  }

  function shortUid(uid) {
    const s = String(uid || "");
    const at = s.indexOf("@");
    return at > 0 ? s.slice(0, at) : s;
  }

  function parseDescriptionMeta(desc) {
    const out = { type: "", location: "", note: desc || "" };
    if (!desc) return out;
    const typeM = desc.match(/type\s*=\s*([^;]+)/i);
    const locM = desc.match(/location\s*=\s*([^;]+)/i);
    if (typeM) out.type = typeM[1].trim();
    if (locM) out.location = locM[1].trim();
    return out;
  }

  /**
   * 解析整份 ICS 文本 → 事件数组（内部统一模型）
   * { id, uid, title, date, weekday, start, end, type, location, description }
   */
  function parseIcs(text) {
    const body = unfold(text);
    const lines = body.split("\n").map((l) => l.replace(/\n$/, ""));
    const events = [];
    let cur = null;

    for (const line of lines) {
      if (!line) continue;
      const upper = line.toUpperCase();
      if (upper === "BEGIN:VEVENT") {
        cur = {};
        continue;
      }
      if (upper === "END:VEVENT") {
        if (cur && cur.uid && cur.title && cur.date && cur.start && cur.end) {
          events.push({
            id: shortUid(cur.uid),
            uid: cur.uid,
            title: cur.title,
            date: cur.date,
            weekday: cur.weekday || weekdayOf(cur.date),
            start: cur.start,
            end: cur.end,
            type: cur.type || "",
            location: cur.location || "",
            description: cur.description || "",
          });
        }
        cur = null;
        continue;
      }
      if (!cur) continue;

      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const left = line.slice(0, colon);
      const value = line.slice(colon + 1);
      const name = left.split(";")[0].toUpperCase();
      const params = left.includes(";") ? left.slice(left.indexOf(";") + 1) : "";

      if (name === "UID") cur.uid = value.trim();
      else if (name === "SUMMARY") cur.title = unescapeText(value);
      else if (name === "DESCRIPTION") {
        cur.description = unescapeText(value);
        const meta = parseDescriptionMeta(cur.description);
        if (meta.type) cur.type = meta.type;
        if (meta.location && !cur.location) cur.location = meta.location;
      } else if (name === "LOCATION") {
        cur.location = unescapeText(value);
      } else if (name === "DTSTART") {
        const dt = parseDateTime(params, value);
        cur.date = dt.date;
        cur.start = dt.time;
        cur.weekday = dt.weekday;
      } else if (name === "DTEND") {
        const dt = parseDateTime(params, value);
        cur.end = dt.time;
        // 跨日时以 DTSTART 的 date 为准；若 DTEND 只有日期不同且时间为次日 0 点，仍记 end 时间
        if (!cur.date) cur.date = dt.date;
      }
    }
    return events;
  }

  function toIcsDateTime(date, hm) {
    const [hh, mm] = String(hm).split(":");
    return `${date.replace(/-/g, "")}T${hh}${mm}00`;
  }

  function stampUtcNow() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return (
      d.getUTCFullYear() +
      p(d.getUTCMonth() + 1) +
      p(d.getUTCDate()) +
      "T" +
      p(d.getUTCHours()) +
      p(d.getUTCMinutes()) +
      p(d.getUTCSeconds()) +
      "Z"
    );
  }

  /** 折行：单行超过 75 字节时用空格续行（按字符近似；中文按码点） */
  function foldLine(line) {
    const max = 75;
    if (line.length <= max) return line;
    const parts = [];
    let rest = line;
    parts.push(rest.slice(0, max));
    rest = rest.slice(max);
    while (rest.length) {
      parts.push(" " + rest.slice(0, max - 1));
      rest = rest.slice(max - 1);
    }
    return parts.join("\r\n");
  }

  /**
   * 序列化事件数组 → ICS 文本
   * 保持 UID 稳定；更新 DTSTART/DTEND；保留 SUMMARY
   */
  function serializeIcs(events, opts) {
    opts = opts || {};
    const calName = opts.calName || "HYROX 训练周程（ICS）";
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//GOSIM Intent Cabin//HYROX Training//ZH",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + escapeText(calName),
      "X-WR-TIMEZONE:Asia/Shanghai",
    ];
    const stamp = stampUtcNow();
    for (const e of events) {
      const uid = e.uid || `${e.id}@gosim-intent-cabin`;
      const descParts = [];
      if (e.type) descParts.push("type=" + e.type);
      if (e.location) descParts.push("location=" + e.location);
      if (e.description && !/^type\s*=/.test(e.description)) {
        descParts.push(e.description);
      }
      const desc = descParts.join("; ") || e.description || "";
      const vevent = [
        "BEGIN:VEVENT",
        "UID:" + uid,
        "DTSTAMP:" + stamp,
        "DTSTART;TZID=Asia/Shanghai:" + toIcsDateTime(e.date, e.start),
        "DTEND;TZID=Asia/Shanghai:" + toIcsDateTime(e.date, e.end),
        "SUMMARY:" + escapeText(e.title),
      ];
      if (desc) vevent.push("DESCRIPTION:" + escapeText(desc));
      if (e.location) vevent.push("LOCATION:" + escapeText(e.location));
      vevent.push("END:VEVENT");
      for (const L of vevent) lines.push(L);
    }
    lines.push("END:VCALENDAR");
    return lines.map(foldLine).join("\r\n") + "\r\n";
  }

  /** 触发浏览器下载 .ics */
  function downloadIcs(filename, icsText) {
    const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "hyrox-training-updated.ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  /** 从 File / Blob 读文本并解析 */
  function parseIcsFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(parseIcs(String(reader.result || "")));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error || new Error("读文件失败"));
      reader.readAsText(file, "UTF-8");
    });
  }

  /** JSON 练习事件 → 补全 uid（便于切到 ICS 写回） */
  function ensureUids(events) {
    return events.map((e) => ({
      ...e,
      uid: e.uid || `${e.id}@gosim-intent-cabin`,
    }));
  }

  global.CalendarIcs = {
    parseIcs,
    serializeIcs,
    downloadIcs,
    parseIcsFile,
    ensureUids,
    weekdayOf,
    shortUid,
  };
})(typeof window !== "undefined" ? window : globalThis);
