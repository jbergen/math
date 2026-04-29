"use strict";

// ---------- Config ----------
const SESSION_LENGTH = 20;
const STORAGE_KEY = "mathApp.v1";
const HISTORY_SIZE = 5;
const LEVEL_UP_STREAK = 3;
const LEVEL_DOWN_STREAK = 2;

const CHEERS = [
  "Nice! 🎉", "You got it! ⭐", "Math star! ✨", "Keep going! 🚀",
  "Awesome! 💪", "Brilliant! 🧠", "Woo-hoo! 🎊", "On fire! 🔥",
  "Great work! 👏", "Smart cookie! 🍪",
];
const STREAK_CHEERS = {
  3: "3 in a row! 🔥",
  5: "5 in a row — you're crushing it! 💫",
  7: "7 in a row! Unstoppable! 🚀",
  10: "10 in a row!! Math legend! 🏆",
};
const GENTLE = [
  "Almost — try once more! 💛",
  "So close! Give it another go!",
  "You can do it — try again!",
  "No worries, try again!",
];

// ---------- Storage ----------
const storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  },
};

// ---------- Problem generation ----------
const ALL_OPS = ["+", "-", "×", "÷"];
const OP_LABEL = { "+": "+", "-": "−", "×": "×", "÷": "÷" };

function randInt(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Difficulty knobs only — operations are chosen by the user.
// Shape: which slot is the unknown. 0 = ?_op_b=c, 1 = a_op_?=c, 2 = a_op_b=?
function levelConfig(level) {
  let shapes = [2]; // result-slot only at level 1
  let maxAdd = 10;
  let maxSub = 10;
  let mulMaxA = 5, mulMaxB = 5;

  if (level >= 3) shapes = [0, 1, 2];
  if (level >= 4) { maxAdd = 20; maxSub = 20; mulMaxA = 10; mulMaxB = 5; }
  if (level >= 5) { maxAdd = 30; maxSub = 30; mulMaxA = 10; mulMaxB = 10; }
  if (level >= 6) { maxAdd = 50; maxSub = 50; mulMaxA = 12; mulMaxB = 12; }
  if (level >= 7) { maxAdd = 100; maxSub = 50; mulMaxA = 12; mulMaxB = 12; }

  return { shapes, maxAdd, maxSub, mulMaxA, mulMaxB };
}

function makeProblem(level, ops) {
  const cfg = levelConfig(level);
  const op = pick(ops);
  const shape = pick(cfg.shapes);

  let a, b, c;
  if (op === "+") {
    a = randInt(0, cfg.maxAdd);
    b = randInt(0, Math.max(0, cfg.maxAdd - a));
    c = a + b;
  } else if (op === "-") {
    a = randInt(1, cfg.maxSub);
    b = randInt(0, a);
    c = a - b;
  } else if (op === "×") {
    a = randInt(0, cfg.mulMaxA);
    b = randInt(0, cfg.mulMaxB);
    c = a * b;
  } else { // ÷  — frame as dividend ÷ divisor = quotient with whole-number result
    const q = randInt(0, cfg.mulMaxA);
    const d = randInt(1, Math.max(1, cfg.mulMaxB));
    a = q * d; // dividend
    b = d;     // divisor
    c = q;     // quotient
  }

  let answer, parts;
  if (shape === 0) { answer = a; parts = ["?", op, String(b), "=", String(c)]; }
  else if (shape === 1) { answer = b; parts = [String(a), op, "?", "=", String(c)]; }
  else { answer = c; parts = [String(a), op, String(b), "=", "?"]; }

  const key = `${op}|${a}|${b}|${c}|${shape}`;
  return { op, a, b, c, shape, answer, parts, key };
}

function generateProblem(level, ops, history) {
  for (let i = 0; i < 20; i++) {
    const p = makeProblem(level, ops);
    if (!history.includes(p.key)) return p;
  }
  return makeProblem(level, ops);
}

// ---------- Session ----------
const session = {
  level: 1,
  ops: ["+", "-"],
  correct: 0,
  total: 0,
  streak: 0,
  wrongStreak: 0,
  maxLevel: 1,
  startedAt: 0,
  timerId: 0,
  current: null,
  buffer: "",
  attemptsOnCurrent: 0,
  history: [],
  retryQueue: [],

  reset(startingLevel, ops) {
    this.level = startingLevel;
    this.ops = ops.slice();
    this.correct = 0;
    this.total = 0;
    this.streak = 0;
    this.wrongStreak = 0;
    this.maxLevel = startingLevel;
    this.startedAt = Date.now();
    this.current = null;
    this.buffer = "";
    this.attemptsOnCurrent = 0;
    this.history = [];
    this.retryQueue = [];
  },
};

// ---------- Settings ----------
const DEFAULT_GAME_SETTINGS = { startingLevel: 1, ops: ["+", "-"] };
const DEFAULT_WS_SETTINGS = { level: 2, count: 20, ops: ["+", "-"] };

function loadSettings() {
  const data = storage.load() || {};
  const game = data.gameSettings || {};
  const ws = data.worksheetSettings || {};
  return {
    game: {
      startingLevel: clampLevel(game.startingLevel ?? DEFAULT_GAME_SETTINGS.startingLevel),
      ops: sanitizeOps(game.ops, DEFAULT_GAME_SETTINGS.ops),
    },
    worksheet: {
      level: clampLevel(ws.level ?? DEFAULT_WS_SETTINGS.level),
      count: WS_COUNTS.includes(ws.count) ? ws.count : DEFAULT_WS_SETTINGS.count,
      ops: sanitizeOps(ws.ops, DEFAULT_WS_SETTINGS.ops),
    },
  };
}

function saveSettings(partial) {
  const prior = storage.load() || {};
  storage.save({ ...prior, ...partial });
}

function clampLevel(n) {
  const lv = Math.floor(Number(n));
  if (!Number.isFinite(lv)) return 1;
  return Math.min(7, Math.max(1, lv));
}

function sanitizeOps(ops, fallback) {
  if (!Array.isArray(ops)) return fallback.slice();
  const filtered = ops.filter((o) => ALL_OPS.includes(o));
  return filtered.length > 0 ? filtered : fallback.slice();
}

// ---------- UI refs ----------
const $ = (id) => document.getElementById(id);
const screens = {
  start: $("screen-start"),
  settings: $("screen-settings"),
  play: $("screen-play"),
  end: $("screen-end"),
  worksheet: $("screen-worksheet"),
  print: $("screen-print"),
};

function showScreen(name) {
  for (const k of Object.keys(screens)) screens[k].classList.toggle("active", k === name);
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function updateStatsBar() {
  $("stat-time").textContent = fmtTime((Date.now() - session.startedAt) / 1000);
  $("stat-correct").textContent = session.correct;
  $("stat-total").textContent = session.total;
  $("stat-streak").textContent = session.streak;
  $("stat-level").textContent = session.level;
}

function renderEquation() {
  const p = session.current;
  const el = $("equation");
  el.innerHTML = "";
  for (const part of p.parts) {
    const span = document.createElement("span");
    if (part === "?") {
      span.className = "slot active";
      span.textContent = session.buffer || " ";
      if (session.buffer) span.classList.add("filled");
    } else {
      span.textContent = part;
    }
    el.appendChild(span);
  }
}

function setFeedback(text, cls) {
  const f = $("feedback");
  f.textContent = text;
  f.className = "feedback" + (cls ? " " + cls : "");
}

// ---------- Confetti ----------
function confettiBurst(n = 24) {
  const host = $("confetti");
  const colors = ["#f28b3b", "#ffd56a", "#32c671", "#4a90e2", "#e26fa5", "#8e6bd3"];
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = pick(colors);
    p.style.animationDelay = (Math.random() * 0.2) + "s";
    p.style.animationDuration = (1 + Math.random() * 0.6) + "s";
    p.style.transform = `translateY(0) rotate(${Math.random() * 360}deg)`;
    host.appendChild(p);
    setTimeout(() => p.remove(), 1800);
  }
}

// ---------- Game flow ----------
function nextProblem() {
  session.buffer = "";
  session.attemptsOnCurrent = 0;

  if (session.total < SESSION_LENGTH) {
    session.current = generateProblem(session.level, session.ops, session.history);
    session.history.push(session.current.key);
    if (session.history.length > HISTORY_SIZE) session.history.shift();
  } else if (session.retryQueue.length > 0) {
    session.current = session.retryQueue.shift();
  } else {
    endSession();
    return;
  }
  renderEquation();
}

function handleKey(key) {
  if (!session.current) return;
  if (key === "back") {
    session.buffer = session.buffer.slice(0, -1);
    renderEquation();
    return;
  }
  if (key === "submit") {
    if (session.buffer.length === 0) return;
    submitAnswer();
    return;
  }
  if (session.buffer.length >= 3) return;
  if (session.buffer === "0") session.buffer = ""; // no leading zero
  session.buffer += key;
  renderEquation();
}

function isSessionComplete() {
  return session.total >= SESSION_LENGTH && session.retryQueue.length === 0;
}

function submitAnswer() {
  const guess = parseInt(session.buffer, 10);
  const correct = guess === session.current.answer;
  session.attemptsOnCurrent += 1;
  const isRetry = !!session.current.isRetry;

  const eq = $("equation");
  if (correct) {
    if (!isRetry) {
      session.correct += 1;
      session.total += 1;
      session.streak += 1;
      session.wrongStreak = 0;

      const streakMsg = STREAK_CHEERS[session.streak];
      setFeedback(streakMsg || pick(CHEERS), "good");
      confettiBurst(session.streak >= 5 ? 40 : 20);

      if (session.streak > 0 && session.streak % LEVEL_UP_STREAK === 0) {
        session.level += 1;
        session.maxLevel = Math.max(session.maxLevel, session.level);
      }
    } else {
      setFeedback("You got it! 🌟", "good");
      confettiBurst(20);
    }
    eq.classList.remove("flash-good"); void eq.offsetWidth; eq.classList.add("flash-good");

    updateStatsBar();
    if (isSessionComplete()) { endSession(); return; }
    setTimeout(nextProblem, 650);
  } else {
    if (!isRetry) session.wrongStreak += 1;

    if (session.attemptsOnCurrent >= 2) {
      eq.classList.remove("flash-bad"); void eq.offsetWidth; eq.classList.add("flash-bad");

      if (!isRetry) {
        session.total += 1;
        session.streak = 0;
        session.retryQueue.push({ ...session.current, isRetry: true });
        setFeedback(`The answer was ${session.current.answer} — we'll come back to this one!`, "bad");

        if (session.wrongStreak >= LEVEL_DOWN_STREAK && session.level > 1) {
          session.level -= 1;
          session.wrongStreak = 0;
        }
      } else {
        setFeedback(`The answer was ${session.current.answer}. Great effort!`, "bad");
      }
      updateStatsBar();
      if (isSessionComplete()) { endSession(); return; }
      setTimeout(nextProblem, 1400);
    } else {
      setFeedback(pick(GENTLE), "bad");
      eq.classList.remove("flash-bad"); void eq.offsetWidth; eq.classList.add("flash-bad");
      session.buffer = "";
      renderEquation();
    }
  }
}

// ---------- Start / End ----------
function startSession() {
  const { game } = loadSettings();
  session.reset(game.startingLevel, game.ops);
  updateStatsBar();
  setFeedback("");
  showScreen("play");
  nextProblem();
  session.timerId = setInterval(updateStatsBar, 500);
}

function endSession() {
  clearInterval(session.timerId);
  const durSec = Math.max(1, (Date.now() - session.startedAt) / 1000);
  const accuracy = session.total === 0 ? 0 : session.correct / session.total;

  $("end-time").textContent = fmtTime(durSec);
  $("end-accuracy").textContent = Math.round(accuracy * 100) + "%";
  $("end-count").textContent = session.total;
  $("end-level").textContent = session.maxLevel;

  // Persist & compute badges
  const prior = storage.load() || {
    bestAccuracy: 0,
    bestTimePerProblemSec: Infinity,
    lifetimeProblems: 0,
    lifetimeCorrect: 0,
    lastSession: null,
  };
  const timePerProblem = session.total > 0 ? durSec / session.total : Infinity;
  const isBestAcc = accuracy > (prior.bestAccuracy || 0) && session.total >= 5;
  const isBestSpeed = timePerProblem < (prior.bestTimePerProblemSec || Infinity) && accuracy >= 0.8 && session.total >= 5;

  const badges = [];
  if (isBestAcc) badges.push("🏆 New best accuracy!");
  if (isBestSpeed) badges.push("⚡ New speed record!");
  if (session.maxLevel >= 5) badges.push("⭐ Reached Level " + session.maxLevel + "!");
  $("end-badge").textContent = badges.join("  •  ");

  // Headline
  let headline = "Great session! 🌟";
  if (accuracy >= 0.95) headline = "Fantastic! 🏆";
  else if (accuracy >= 0.8) headline = "Awesome work! 🎉";
  else if (accuracy >= 0.6) headline = "Good try! 💪";
  else headline = "Keep practicing — you're growing! 🌱";
  $("end-headline").textContent = headline;

  // Reset stats visibility each time
  $("end-stats").classList.add("hidden");
  $("btn-show-stats").textContent = "Show stats";

  storage.save({
    ...prior,
    bestAccuracy: Math.max(prior.bestAccuracy || 0, accuracy),
    bestTimePerProblemSec: Math.min(prior.bestTimePerProblemSec || Infinity, timePerProblem),
    lifetimeProblems: (prior.lifetimeProblems || 0) + session.total,
    lifetimeCorrect: (prior.lifetimeCorrect || 0) + session.correct,
    lastSession: {
      dateISO: new Date().toISOString(),
      durationSec: durSec,
      correct: session.correct,
      total: session.total,
      maxLevel: session.maxLevel,
    },
  });

  showScreen("end");
  confettiBurst(accuracy >= 0.8 ? 80 : 30);
}

// ---------- Worksheet ----------
const WS_LEVELS = [1, 2, 3, 4, 5, 6, 7];
const WS_COUNTS = [10, 20, 30];

function buildWorksheet(level, ops, count) {
  const history = [];
  const problems = [];
  for (let i = 0; i < count; i++) {
    const p = generateProblem(level, ops, history);
    history.push(p.key);
    if (history.length > 10) history.shift();
    problems.push(p);
  }
  return problems;
}

function renderChoiceGroup(host, items, isSelected, onClick, format) {
  host.innerHTML = "";
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ws-choice" + (isSelected(item) ? " selected" : "");
    btn.textContent = format ? format(item) : String(item);
    btn.addEventListener("click", () => onClick(item));
    host.appendChild(btn);
  }
}

function renderWorksheetChoices() {
  const { worksheet } = loadSettings();
  renderChoiceGroup(
    $("ws-levels"),
    WS_LEVELS,
    (lv) => lv === worksheet.level,
    (lv) => { saveSettings({ worksheetSettings: { ...worksheet, level: lv } }); renderWorksheetChoices(); },
  );
  renderChoiceGroup(
    $("ws-ops"),
    ALL_OPS,
    (op) => worksheet.ops.includes(op),
    (op) => {
      const has = worksheet.ops.includes(op);
      const next = has ? worksheet.ops.filter((o) => o !== op) : [...worksheet.ops, op];
      if (next.length === 0) return; // require at least one op
      saveSettings({ worksheetSettings: { ...worksheet, ops: next } });
      renderWorksheetChoices();
    },
    (op) => OP_LABEL[op],
  );
  renderChoiceGroup(
    $("ws-counts"),
    WS_COUNTS,
    (n) => n === worksheet.count,
    (n) => { saveSettings({ worksheetSettings: { ...worksheet, count: n } }); renderWorksheetChoices(); },
  );
}

function renderWorksheet(problems) {
  const ol = $("ws-problems");
  ol.innerHTML = "";
  for (const p of problems) {
    const li = document.createElement("li");
    const wrap = document.createElement("span");
    wrap.className = "ws-problem";
    for (const part of p.parts) {
      if (part === "?") {
        const blank = document.createElement("span");
        blank.className = "ws-blank";
        wrap.appendChild(blank);
      } else {
        const span = document.createElement("span");
        span.textContent = part;
        wrap.appendChild(span);
      }
    }
    li.appendChild(wrap);
    ol.appendChild(li);
  }
}

// ---------- Settings screen ----------
function renderSettingsChoices() {
  const { game } = loadSettings();
  renderChoiceGroup(
    $("settings-levels"),
    WS_LEVELS,
    (lv) => lv === game.startingLevel,
    (lv) => { saveSettings({ gameSettings: { ...game, startingLevel: lv } }); renderSettingsChoices(); },
  );
  renderChoiceGroup(
    $("settings-ops"),
    ALL_OPS,
    (op) => game.ops.includes(op),
    (op) => {
      const has = game.ops.includes(op);
      const next = has ? game.ops.filter((o) => o !== op) : [...game.ops, op];
      if (next.length === 0) return;
      saveSettings({ gameSettings: { ...game, ops: next } });
      renderSettingsChoices();
    },
    (op) => OP_LABEL[op],
  );
}

function opsLabel(ops) {
  return ops.map((o) => OP_LABEL[o]).join(" ");
}

function renderLastSession() {
  const data = storage.load();
  const el = $("last-session");
  if (!data || !data.lastSession) { el.classList.add("hidden"); return; }
  const ls = data.lastSession;
  const acc = ls.total ? Math.round((ls.correct / ls.total) * 100) : 0;
  el.innerHTML = `Last time: <strong>${acc}%</strong> in <strong>${fmtTime(ls.durationSec)}</strong> (${ls.correct}/${ls.total})`;
  el.classList.remove("hidden");
}

// ---------- Wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  renderLastSession();

  $("btn-start").addEventListener("click", startSession);
  $("btn-again").addEventListener("click", () => { renderLastSession(); showScreen("start"); });
  $("btn-done").addEventListener("click", () => { if (session.total > 0) endSession(); else showScreen("start"); });
  $("btn-show-stats").addEventListener("click", () => {
    const stats = $("end-stats");
    const btn = $("btn-show-stats");
    const hidden = stats.classList.toggle("hidden");
    btn.textContent = hidden ? "Show stats" : "Hide stats";
  });

  const menuEl = $("menu");
  const menuBtn = $("btn-menu");
  const closeMenu = () => { menuEl.classList.add("hidden"); menuBtn.setAttribute("aria-expanded", "false"); };
  const openMenu = () => { menuEl.classList.remove("hidden"); menuBtn.setAttribute("aria-expanded", "true"); };
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menuEl.classList.contains("hidden") ? openMenu() : closeMenu();
  });
  document.addEventListener("click", (e) => {
    if (menuEl.classList.contains("hidden")) return;
    if (menuEl.contains(e.target) || e.target === menuBtn) return;
    closeMenu();
  });

  $("btn-settings").addEventListener("click", () => {
    closeMenu();
    renderSettingsChoices();
    showScreen("settings");
  });
  $("btn-settings-back").addEventListener("click", () => showScreen("start"));
  $("btn-settings-start").addEventListener("click", startSession);

  $("btn-worksheet").addEventListener("click", () => {
    closeMenu();
    renderWorksheetChoices();
    showScreen("worksheet");
  });
  $("btn-worksheet-back").addEventListener("click", () => showScreen("start"));
  $("btn-make-worksheet").addEventListener("click", () => {
    const { worksheet } = loadSettings();
    const problems = buildWorksheet(worksheet.level, worksheet.ops, worksheet.count);
    renderWorksheet(problems);
    $("ws-title").textContent = `Math Worksheet — Level ${worksheet.level} (${opsLabel(worksheet.ops)})`;
    showScreen("print");
  });
  $("btn-print").addEventListener("click", () => window.print());
  $("btn-print-back").addEventListener("click", () => showScreen("worksheet"));

  document.querySelectorAll(".key").forEach((btn) => {
    btn.addEventListener("click", () => handleKey(btn.dataset.key));
  });

  // Prevent zoom on double-tap for iOS
  let lastTouch = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouch <= 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
});
