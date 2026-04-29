"use strict";

// ---------- Config ----------
const SESSION_LENGTH = 20;
const STORAGE_KEY = "mathApp.v1";
const HISTORY_SIZE = 5;
const GRADE_UP_STREAK = 3;
const GRADE_DOWN_STREAK = 2;
const MAX_GRADE = 5;

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
function applyOp(x, op, y) {
  if (op === "+") return x + y;
  if (op === "-") return x - y;
  if (op === "×") return x * y;
  if (op === "÷") return x / y;
  return NaN;
}
function isMulOrDiv(op) { return op === "×" || op === "÷"; }

// Per-grade baseline difficulty for free-play (curriculum-aligned).
// Shape: which slot is the unknown. 0 = ?_op_b=c, 1 = a_op_?=c, 2 = a_op_b=?
function gradeConfig(grade) {
  // G1: result-slot only, add/sub within 20.
  let shapes = [2];
  let maxAdd = 20, maxSub = 20;
  let mulMaxA = 5, mulMaxB = 5;

  if (grade >= 2) { shapes = [0, 1, 2]; maxAdd = 100; maxSub = 100; mulMaxA = 10; mulMaxB = 5; }
  if (grade >= 3) { maxAdd = 1000; maxSub = 1000; mulMaxA = 12; mulMaxB = 12; }
  if (grade >= 4) { maxAdd = 10000; maxSub = 10000; mulMaxA = 99; mulMaxB = 9; }
  if (grade >= 5) { maxAdd = 100000; maxSub = 100000; mulMaxA = 999; mulMaxB = 99; }

  return { shapes, maxAdd, maxSub, mulMaxA, mulMaxB };
}

function gradeDefaultOps(grade) {
  if (grade <= 2) return ["+", "-"];
  return ["+", "-", "×", "÷"];
}

// Build a free-play config from grade + chosen ops.
function freePlayConfig(grade, ops) {
  return { ...gradeConfig(grade), ops: ops.slice(), grade };
}

// ---------- Skill packs ----------
// A pack is a problem-generation config with a label and grade.
// Flags supported by makeProblem:
//   minA, minB         — minimum operand sizes (e.g. force 2-digit)
//   forceCarry         — at least one carry in addition (ones place)
//   forceBorrow        — borrow in subtraction (ones place)
//   chosenMultiplier   — fix one factor in multiplication/division
//   allowRemainders    — division may produce non-zero remainder (two-slot answer)
//   decimals           — operands and answer use N decimal places (scaled-int internal)
//   multiTerm          — produce 3-operand expressions respecting precedence
const SKILL_PACKS = [
  // Grade 1
  { id: "g1-add-10",    grade: 1, label: "Adding within 10",
    ops: ["+"], shapes: [2], maxAdd: 10 },
  { id: "g1-add-20",    grade: 1, label: "Adding within 20",
    ops: ["+"], shapes: [2], maxAdd: 20 },
  { id: "g1-sub-20",    grade: 1, label: "Subtracting within 20",
    ops: ["-"], shapes: [2], maxSub: 20 },
  // Grade 2
  { id: "g2-mixed-100", grade: 2, label: "Add & subtract within 100",
    ops: ["+", "-"], shapes: [0, 1, 2], maxAdd: 100, maxSub: 100 },
  { id: "g2-add-carry", grade: 2, label: "2-digit addition with carrying",
    ops: ["+"], shapes: [2], maxAdd: 99, minA: 10, minB: 10, forceCarry: true },
  { id: "g2-sub-borrow",grade: 2, label: "2-digit subtraction with borrowing",
    ops: ["-"], shapes: [2], maxSub: 99, minA: 10, minB: 10, forceBorrow: true },
  // Grade 3
  { id: "g3-mixed-1000",grade: 3, label: "Add & subtract within 1000",
    ops: ["+", "-"], shapes: [0, 1, 2], maxAdd: 1000, maxSub: 1000 },
  { id: "g3-tt-mix",    grade: 3, label: "Mixed times tables 0–10",
    ops: ["×"], shapes: [2], mulMaxA: 10, mulMaxB: 10 },
  { id: "g3-tt-12",     grade: 3, label: "Times tables through ×12",
    ops: ["×"], shapes: [2], mulMaxA: 12, mulMaxB: 12 },
  { id: "g3-div-facts", grade: 3, label: "Division facts within 100",
    ops: ["÷"], shapes: [2], mulMaxA: 12, mulMaxB: 10 },
  // Grade 4
  { id: "g4-mul-2x1",   grade: 4, label: "Long multiplication 2 × 1",
    ops: ["×"], shapes: [2], mulMaxA: 99, mulMaxB: 9, minA: 10, minB: 2 },
  { id: "g4-mul-2x2",   grade: 4, label: "Long multiplication 2 × 2",
    ops: ["×"], shapes: [2], mulMaxA: 99, mulMaxB: 99, minA: 10, minB: 10 },
  { id: "g4-div-rem",   grade: 4, label: "Long division with remainders",
    ops: ["÷"], shapes: [2], mulMaxA: 99, mulMaxB: 9, minA: 12, minB: 2,
    allowRemainders: true },
  { id: "g4-dec-tenths",grade: 4, label: "Decimals — adding tenths",
    ops: ["+", "-"], shapes: [2], maxAdd: 100, maxSub: 100, decimals: 1 },
  // Grade 5
  { id: "g5-mul-multi", grade: 5, label: "Multi-digit multiplication",
    ops: ["×"], shapes: [2], mulMaxA: 999, mulMaxB: 99, minA: 100, minB: 10 },
  { id: "g5-div-multi", grade: 5, label: "Long division 4 ÷ 2",
    ops: ["÷"], shapes: [2], mulMaxA: 9999, mulMaxB: 99, minA: 100, minB: 10,
    allowRemainders: true },
  { id: "g5-dec-hundr", grade: 5, label: "Decimals — hundredths",
    ops: ["+", "-"], shapes: [2], maxAdd: 100, maxSub: 100, decimals: 2 },
  { id: "g5-order-ops", grade: 5, label: "Order of operations",
    ops: ["+", "-", "×"], shapes: [2], maxAdd: 12, maxSub: 12, mulMaxA: 12, mulMaxB: 12,
    multiTerm: 3 },
];
// Per-multiplier "Times tables ×N" packs at grade 3 (rendered as a chip row).
const TIMES_TABLE_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
for (const m of TIMES_TABLE_MULTIPLIERS) {
  SKILL_PACKS.push({
    id: `g3-tt-${m}`, grade: 3, label: `×${m}`, group: "times-tables",
    ops: ["×"], shapes: [2], mulMaxA: 12, mulMaxB: 12, chosenMultiplier: m,
  });
}

function packById(id) { return SKILL_PACKS.find((p) => p.id === id) || null; }

// ---------- Generation ----------
// All paths produce a problem: { parts, slots, key, ... }
//   parts: tokens to render. Each "?" denotes an answer slot.
//   slots: array of expected answers (one per "?" in parts), as numbers.
function makeProblem(cfg) {
  if (cfg.multiTerm === 3) return makeMultiTermProblem(cfg);
  if (cfg.decimals && cfg.decimals > 0) return makeDecimalProblem(cfg);

  const op = pick(cfg.ops);
  const shape = pick(cfg.shapes || [2]);

  if (op === "÷" && cfg.allowRemainders && shape === 2) {
    return makeDivisionWithRemainder(cfg);
  }

  let a, b, c;
  if (op === "+")      [a, b, c] = genAddition(cfg);
  else if (op === "-") [a, b, c] = genSubtraction(cfg);
  else if (op === "×") [a, b, c] = genMultiplication(cfg);
  else                 [a, b, c] = genDivisionWhole(cfg);

  let parts, slots;
  if (shape === 0)      { slots = [a]; parts = ["?", op, String(b), "=", String(c)]; }
  else if (shape === 1) { slots = [b]; parts = [String(a), op, "?", "=", String(c)]; }
  else                  { slots = [c]; parts = [String(a), op, String(b), "=", "?"]; }

  const key = `${op}|${a}|${b}|${c}|${shape}`;
  return { op, a, b, c, parts, slots, key };
}

function genAddition(cfg) {
  const minA = cfg.minA ?? 0, minB = cfg.minB ?? 0;
  const maxA = cfg.maxAdd ?? 100, maxB = cfg.maxAdd ?? 100;
  for (let i = 0; i < 60; i++) {
    const a = randInt(minA, maxA);
    const bUpper = Math.max(minB, Math.min(maxB, (cfg.maxAdd ?? maxA) - a));
    if (bUpper < minB) continue;
    const b = randInt(minB, bUpper);
    if (cfg.forceCarry && (a % 10) + (b % 10) < 10) continue;
    return [a, b, a + b];
  }
  const a = randInt(minA, maxA);
  const b = randInt(minB, Math.max(minB, (cfg.maxAdd ?? maxA) - a));
  return [a, b, a + b];
}

function genSubtraction(cfg) {
  const minA = Math.max(1, cfg.minA ?? 1), minB = cfg.minB ?? 0;
  const maxA = cfg.maxSub ?? 100, maxB = cfg.maxSub ?? 100;
  for (let i = 0; i < 60; i++) {
    const a = randInt(minA, maxA);
    const bUpper = Math.min(maxB, a);
    if (bUpper < minB) continue;
    const b = randInt(minB, bUpper);
    if (cfg.forceBorrow && (a % 10) >= (b % 10)) continue;
    return [a, b, a - b];
  }
  const a = randInt(minA, maxA);
  const b = randInt(minB, Math.min(maxB, a));
  return [a, b, a - b];
}

function genMultiplication(cfg) {
  const minA = cfg.minA ?? 0, minB = cfg.minB ?? 0;
  const maxA = cfg.mulMaxA ?? 12, maxB = cfg.mulMaxB ?? 12;
  if (cfg.chosenMultiplier != null) {
    const fixed = cfg.chosenMultiplier;
    const other = randInt(minB || 0, maxB);
    return Math.random() < 0.5 ? [fixed, other, fixed * other] : [other, fixed, other * fixed];
  }
  const a = randInt(minA, maxA);
  const b = randInt(minB, maxB);
  return [a, b, a * b];
}

function genDivisionWhole(cfg) {
  const maxQ = cfg.mulMaxA ?? 12, maxD = cfg.mulMaxB ?? 12;
  const minD = Math.max(1, cfg.minB ?? 1);
  if (cfg.chosenMultiplier != null) {
    const d = cfg.chosenMultiplier;
    const q = randInt(0, maxQ);
    return [q * d, d, q];
  }
  const q = randInt(0, maxQ);
  const d = randInt(minD, Math.max(minD, maxD));
  return [q * d, d, q];
}

function makeDivisionWithRemainder(cfg) {
  const maxA = cfg.mulMaxA ?? 99, maxB = cfg.mulMaxB ?? 9;
  const minA = Math.max(1, cfg.minA ?? 12);
  const minB = Math.max(2, cfg.minB ?? 2);
  const a = randInt(minA, maxA);
  const b = randInt(minB, maxB);
  const q = Math.floor(a / b);
  const r = a - q * b;
  const parts = [String(a), "÷", String(b), "=", "?", "r", "?"];
  const slots = [q, r];
  const key = `÷r|${a}|${b}|${q}|${r}`;
  return { op: "÷", a, b, q, r, parts, slots, key, withRemainder: true };
}

function makeDecimalProblem(cfg) {
  const N = cfg.decimals;
  const scale = Math.pow(10, N);
  const op = pick(cfg.ops);
  const max = (op === "-" ? (cfg.maxSub ?? 100) : (cfg.maxAdd ?? 100)) * scale;
  let intA, intB, intC;
  if (op === "+") {
    intA = randInt(0, max);
    intB = randInt(0, Math.max(0, max - intA));
    intC = intA + intB;
  } else if (op === "-") {
    intA = randInt(1, max);
    intB = randInt(0, intA);
    intC = intA - intB;
  } else {
    intA = 0; intB = 1; intC = 0;
  }
  const fmt = (n) => (n / scale).toFixed(N);
  const parts = [fmt(intA), op, fmt(intB), "=", "?"];
  const slots = [intC / scale];
  const key = `dec${N}|${op}|${intA}|${intB}|${intC}`;
  return { op, intA, intB, intC, parts, slots, key, decimals: N };
}

function makeMultiTermProblem(cfg) {
  const ops = cfg.ops || ["+", "-", "×"];
  const maxAdd = cfg.maxAdd ?? 12;
  const mulMaxA = cfg.mulMaxA ?? 12, mulMaxB = cfg.mulMaxB ?? 12;
  for (let i = 0; i < 80; i++) {
    const op1 = pick(ops), op2 = pick(ops);
    const a = randInt(1, isMulOrDiv(op1) ? mulMaxA : maxAdd);
    const b = randInt(1, isMulOrDiv(op1) || isMulOrDiv(op2) ? mulMaxB : maxAdd);
    const c = randInt(1, isMulOrDiv(op2) ? mulMaxB : maxAdd);
    const p1 = isMulOrDiv(op1) ? 2 : 1, p2 = isMulOrDiv(op2) ? 2 : 1;
    const result = (p1 >= p2)
      ? applyOp(applyOp(a, op1, b), op2, c)
      : applyOp(a, op1, applyOp(b, op2, c));
    if (!Number.isInteger(result) || result < 0 || result > 999) continue;
    if (op1 !== "×" && op2 !== "×" && Math.random() < 0.7) continue;
    const parts = [String(a), op1, String(b), op2, String(c), "=", "?"];
    const slots = [result];
    const key = `mt|${a}|${op1}|${b}|${op2}|${c}|${result}`;
    return { a, b, c, op1, op2, parts, slots, key, multiTerm: true };
  }
  const a = randInt(1, 10), b = randInt(1, 10);
  return { a, b, c: a + b, op: "+", parts: [String(a), "+", String(b), "=", "?"], slots: [a + b], key: `fb|${a}|${b}` };
}

function generateProblem(cfg, history) {
  for (let i = 0; i < 20; i++) {
    const p = makeProblem(cfg);
    if (!history.includes(p.key)) return p;
  }
  return makeProblem(cfg);
}

// ---------- Session ----------
const session = {
  grade: 1,
  ops: ["+", "-"],
  config: null,
  pack: null,
  correct: 0,
  total: 0,
  streak: 0,
  wrongStreak: 0,
  maxGrade: 1,
  startedAt: 0,
  timerId: 0,
  current: null,
  buffers: [""],
  activeSlot: 0,
  attemptsOnCurrent: 0,
  history: [],
  retryQueue: [],

  reset(config, pack) {
    this.config = config;
    this.pack = pack || null;
    this.grade = config.grade || (pack ? pack.grade : 1);
    this.ops = (config.ops || []).slice();
    this.correct = 0;
    this.total = 0;
    this.streak = 0;
    this.wrongStreak = 0;
    this.maxGrade = this.grade;
    this.startedAt = Date.now();
    this.current = null;
    this.buffers = [""];
    this.activeSlot = 0;
    this.attemptsOnCurrent = 0;
    this.history = [];
    this.retryQueue = [];
  },
};

function slotCount(p) { return (p && p.slots) ? p.slots.length : 1; }
function activeBuffer() { return session.buffers[session.activeSlot] || ""; }
function setActiveBuffer(s) { session.buffers[session.activeSlot] = s; }

// ---------- Settings ----------
const DEFAULT_GAME_SETTINGS = { startingGrade: 1, ops: ["+", "-"] };
const DEFAULT_WS_SETTINGS = { grade: 2, count: 20, ops: ["+", "-"] };

function loadSettings() {
  const data = storage.load() || {};
  const game = data.gameSettings || {};
  const ws = data.worksheetSettings || {};
  return {
    game: {
      // Backwards compat: previous schema used `startingLevel` (1–10), now `startingGrade` (1–5).
      startingGrade: clampGrade(game.startingGrade ?? game.startingLevel ?? DEFAULT_GAME_SETTINGS.startingGrade),
      ops: sanitizeOps(game.ops, DEFAULT_GAME_SETTINGS.ops),
    },
    worksheet: {
      grade: clampGrade(ws.grade ?? ws.level ?? DEFAULT_WS_SETTINGS.grade),
      count: WS_COUNTS.includes(ws.count) ? ws.count : DEFAULT_WS_SETTINGS.count,
      ops: sanitizeOps(ws.ops, DEFAULT_WS_SETTINGS.ops),
    },
    lastPackId: typeof data.lastPackId === "string" ? data.lastPackId : null,
    lastWorksheetPackId: typeof data.lastWorksheetPackId === "string" ? data.lastWorksheetPackId : null,
  };
}

function saveSettings(partial) {
  const prior = storage.load() || {};
  storage.save({ ...prior, ...partial });
}

function clampGrade(n) {
  const g = Math.floor(Number(n));
  if (!Number.isFinite(g)) return 1;
  return Math.min(MAX_GRADE, Math.max(1, g));
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

const CLOSE_TARGET = {
  settings: "start",
  worksheet: "start",
  print: "worksheet",
};

let activeScreen = "start";

function showScreen(name) {
  activeScreen = name;
  for (const k of Object.keys(screens)) screens[k].classList.toggle("active", k === name);
  const closeBtn = $("btn-close");
  if (closeBtn) closeBtn.classList.toggle("hidden", !(name in CLOSE_TARGET));
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
  $("stat-grade").textContent = session.grade;
}

function renderEquation() {
  const p = session.current;
  const el = $("equation");
  el.innerHTML = "";
  let slotIdx = 0;
  for (const part of p.parts) {
    const span = document.createElement("span");
    if (part === "?") {
      const isActive = slotIdx === session.activeSlot;
      const buf = session.buffers[slotIdx] || "";
      span.className = "slot" + (isActive ? " active" : "");
      span.textContent = buf || " ";
      if (buf) span.classList.add("filled");
      slotIdx += 1;
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
  session.attemptsOnCurrent = 0;
  session.activeSlot = 0;

  if (session.total < SESSION_LENGTH) {
    session.current = generateProblem(session.config, session.history);
    session.history.push(session.current.key);
    if (session.history.length > HISTORY_SIZE) session.history.shift();
  } else if (session.retryQueue.length > 0) {
    session.current = session.retryQueue.shift();
  } else {
    endSession();
    return;
  }
  session.buffers = new Array(slotCount(session.current)).fill("");
  applyKeypadModeForProblem();
  renderEquation();
}

// Show or hide the decimal key based on the active problem's needs.
function applyKeypadModeForProblem() {
  const p = session.current;
  const wantsDecimal = !!(p && p.decimals && p.decimals > 0);
  const dot = document.querySelector(".key[data-key='.']");
  if (dot) dot.classList.toggle("hidden", !wantsDecimal);
}

function bufferDigitCap(p) {
  // Decimal problems may need extra room for a decimal point.
  if (p && p.decimals) return 8;
  return 7;
}

function handleKey(key) {
  if (!session.current) return;
  if (key === "back") {
    setActiveBuffer(activeBuffer().slice(0, -1));
    renderEquation();
    return;
  }
  if (key === "submit") {
    // If the active slot is empty, do nothing.
    if (activeBuffer().length === 0) return;
    // If there's a later empty slot, advance to it instead of validating.
    const nextEmpty = session.buffers.findIndex((b, i) => i > session.activeSlot && b.length === 0);
    if (nextEmpty !== -1) {
      session.activeSlot = nextEmpty;
      renderEquation();
      return;
    }
    // All slots have content; validate.
    submitAnswer();
    return;
  }
  const buf = activeBuffer();
  if (buf.length >= bufferDigitCap(session.current)) return;
  if (key === ".") {
    if (!session.current.decimals) return;
    if (buf.includes(".")) return;
    setActiveBuffer(buf.length === 0 ? "0." : buf + ".");
    renderEquation();
    return;
  }
  // Digit input: drop a stale leading "0".
  if (buf === "0") setActiveBuffer("");
  setActiveBuffer(activeBuffer() + key);
  renderEquation();
}

function isSessionComplete() {
  return session.total >= SESSION_LENGTH && session.retryQueue.length === 0;
}

function answersMatch(p) {
  for (let i = 0; i < p.slots.length; i++) {
    const guess = parseFloat(session.buffers[i]);
    const expected = p.slots[i];
    if (!Number.isFinite(guess)) return false;
    if (p.decimals) {
      const tol = 0.5 * Math.pow(10, -p.decimals - 1);
      if (Math.abs(guess - expected) > tol) return false;
    } else {
      if (guess !== expected) return false;
    }
  }
  return true;
}

function formatAnswer(p) {
  if (p.decimals) return p.slots.map((s) => s.toFixed(p.decimals)).join(" r ");
  return p.slots.join(" r ");
}

function gradeUpDownAllowed() {
  // Only adjust grade in free-play. Skill packs hold difficulty fixed.
  return session.pack == null;
}

function submitAnswer() {
  const p = session.current;
  const correct = answersMatch(p);
  session.attemptsOnCurrent += 1;
  const isRetry = !!p.isRetry;

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

      if (gradeUpDownAllowed() && session.streak > 0 && session.streak % GRADE_UP_STREAK === 0 && session.grade < MAX_GRADE) {
        session.grade += 1;
        session.maxGrade = Math.max(session.maxGrade, session.grade);
        // Refresh active config when grade changes in free-play.
        session.config = freePlayConfig(session.grade, session.ops);
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
        session.retryQueue.push({ ...p, isRetry: true });
        setFeedback(`The answer was ${formatAnswer(p)} — we'll come back to this one!`, "bad");

        if (gradeUpDownAllowed() && session.wrongStreak >= GRADE_DOWN_STREAK && session.grade > 1) {
          session.grade -= 1;
          session.wrongStreak = 0;
          session.config = freePlayConfig(session.grade, session.ops);
        }
      } else {
        setFeedback(`The answer was ${formatAnswer(p)}. Great effort!`, "bad");
      }
      updateStatsBar();
      if (isSessionComplete()) { endSession(); return; }
      setTimeout(nextProblem, 1400);
    } else {
      setFeedback(pick(GENTLE), "bad");
      eq.classList.remove("flash-bad"); void eq.offsetWidth; eq.classList.add("flash-bad");
      session.buffers = new Array(slotCount(p)).fill("");
      session.activeSlot = 0;
      renderEquation();
    }
  }
}

// ---------- Start / End ----------
function startSessionWithConfig(config, pack) {
  session.reset(config, pack);
  if (pack) saveSettings({ lastPackId: pack.id });
  updateStatsBar();
  setFeedback("");
  showScreen("play");
  nextProblem();
  session.timerId = setInterval(updateStatsBar, 500);
}

function startFreePlaySession() {
  const { game } = loadSettings();
  const cfg = freePlayConfig(game.startingGrade, game.ops);
  startSessionWithConfig(cfg, null);
}

function startPackSession(pack) {
  startSessionWithConfig({ ...pack, grade: pack.grade }, pack);
}

function endSession() {
  clearInterval(session.timerId);
  const durSec = Math.max(1, (Date.now() - session.startedAt) / 1000);
  const accuracy = session.total === 0 ? 0 : session.correct / session.total;

  $("end-time").textContent = fmtTime(durSec);
  $("end-accuracy").textContent = Math.round(accuracy * 100) + "%";
  $("end-count").textContent = session.total;
  $("end-grade").textContent = session.maxGrade;

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
  if (session.maxGrade >= 4) badges.push("🎓 Reached Grade " + session.maxGrade + "!");
  $("end-badge").textContent = badges.join("  •  ");

  let headline = "Great session! 🌟";
  if (accuracy >= 0.95) headline = "Fantastic! 🏆";
  else if (accuracy >= 0.8) headline = "Awesome work! 🎉";
  else if (accuracy >= 0.6) headline = "Good try! 💪";
  else headline = "Keep practicing — you're growing! 🌱";
  $("end-headline").textContent = headline;

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
      maxGrade: session.maxGrade,
      packId: session.pack ? session.pack.id : null,
      packLabel: session.pack ? session.pack.label : null,
    },
  });

  showScreen("end");
  confettiBurst(accuracy >= 0.8 ? 80 : 30);
}

// ---------- Worksheet ----------
const WS_GRADES = [1, 2, 3, 4, 5];
const WS_COUNTS = [10, 20, 30];

function buildWorksheetFromConfig(config, count) {
  const history = [];
  const problems = [];
  for (let i = 0; i < count; i++) {
    const p = generateProblem(config, history);
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
    $("ws-grades"),
    WS_GRADES,
    (g) => g === worksheet.grade,
    (g) => { saveSettings({ worksheetSettings: { ...worksheet, grade: g } }); renderWorksheetChoices(); },
  );
  renderChoiceGroup(
    $("ws-ops"),
    ALL_OPS,
    (op) => worksheet.ops.includes(op),
    (op) => {
      const has = worksheet.ops.includes(op);
      const next = has ? worksheet.ops.filter((o) => o !== op) : [...worksheet.ops, op];
      if (next.length === 0) return;
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

// ---------- Skill-pack picker UI (used in both settings & worksheet screens) ----------
function packsByGrade() {
  const buckets = new Map();
  for (const g of WS_GRADES) buckets.set(g, []);
  for (const pack of SKILL_PACKS) {
    if (!buckets.has(pack.grade)) buckets.set(pack.grade, []);
    buckets.get(pack.grade).push(pack);
  }
  return buckets;
}

// Render a list of skill packs grouped by grade into `host`.
// onPick(pack) is called when a pack chip is tapped.
function renderPackList(host, onPick) {
  host.innerHTML = "";
  const buckets = packsByGrade();
  for (const g of WS_GRADES) {
    const packs = buckets.get(g) || [];
    if (packs.length === 0) continue;
    const grp = document.createElement("div");
    grp.className = "pack-grade";

    const head = document.createElement("div");
    head.className = "pack-grade-label";
    head.textContent = `Grade ${g}`;
    grp.appendChild(head);

    // Plain (non-grouped) packs first.
    const plain = packs.filter((p) => !p.group);
    if (plain.length > 0) {
      const row = document.createElement("div");
      row.className = "pack-row";
      for (const pack of plain) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pack-chip";
        btn.textContent = pack.label;
        btn.addEventListener("click", () => onPick(pack));
        row.appendChild(btn);
      }
      grp.appendChild(row);
    }

    // Grouped packs (e.g. times-tables) on a labeled subrow.
    const groups = new Map();
    for (const pack of packs) {
      if (!pack.group) continue;
      if (!groups.has(pack.group)) groups.set(pack.group, []);
      groups.get(pack.group).push(pack);
    }
    for (const [groupName, groupPacks] of groups) {
      const sub = document.createElement("div");
      sub.className = "pack-subgroup";
      const sublabel = document.createElement("div");
      sublabel.className = "pack-subgroup-label";
      sublabel.textContent = groupName === "times-tables" ? "Times tables" : groupName;
      sub.appendChild(sublabel);
      const subrow = document.createElement("div");
      subrow.className = "pack-row pack-row-tight";
      for (const pack of groupPacks) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pack-chip pack-chip-small";
        btn.textContent = pack.label;
        btn.addEventListener("click", () => onPick(pack));
        subrow.appendChild(btn);
      }
      sub.appendChild(subrow);
      grp.appendChild(sub);
    }

    host.appendChild(grp);
  }
}

// ---------- Settings screen ----------
function renderSettingsChoices() {
  const { game } = loadSettings();
  renderChoiceGroup(
    $("settings-grades"),
    WS_GRADES,
    (g) => g === game.startingGrade,
    (g) => { saveSettings({ gameSettings: { ...game, startingGrade: g } }); renderSettingsChoices(); },
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
  const packsHost = $("settings-packs");
  if (packsHost) renderPackList(packsHost, (pack) => startPackSession(pack));
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
  const where = ls.packLabel ? ` · ${ls.packLabel}` : "";
  el.innerHTML = `Last time: <strong>${acc}%</strong> in <strong>${fmtTime(ls.durationSec)}</strong> (${ls.correct}/${ls.total})${where}`;
  el.classList.remove("hidden");
}

// ---------- Wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  renderLastSession();

  $("btn-play").addEventListener("click", () => {
    renderSettingsChoices();
    showScreen("settings");
  });
  $("btn-again").addEventListener("click", () => { renderLastSession(); showScreen("start"); });
  $("btn-done").addEventListener("click", () => { if (session.total > 0) endSession(); else showScreen("start"); });
  $("btn-show-stats").addEventListener("click", () => {
    const stats = $("end-stats");
    const btn = $("btn-show-stats");
    const hidden = stats.classList.toggle("hidden");
    btn.textContent = hidden ? "Show stats" : "Hide stats";
  });

  $("btn-settings-start").addEventListener("click", startFreePlaySession);

  $("btn-worksheet").addEventListener("click", () => {
    renderWorksheetChoices();
    const packsHost = $("ws-packs");
    if (packsHost) renderPackList(packsHost, (pack) => makeWorksheetForPack(pack));
    showScreen("worksheet");
  });
  $("btn-make-worksheet").addEventListener("click", () => {
    const { worksheet } = loadSettings();
    const config = freePlayConfig(worksheet.grade, worksheet.ops);
    const problems = buildWorksheetFromConfig(config, worksheet.count);
    renderWorksheet(problems);
    $("ws-title").textContent = `Math Worksheet — Grade ${worksheet.grade} (${opsLabel(worksheet.ops)})`;
    showScreen("print");
  });
  $("btn-print").addEventListener("click", () => window.print());

  $("btn-close").addEventListener("click", () => {
    const target = CLOSE_TARGET[activeScreen] || "start";
    showScreen(target);
  });

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

function makeWorksheetForPack(pack) {
  const { worksheet } = loadSettings();
  const count = worksheet.count;
  const problems = buildWorksheetFromConfig({ ...pack }, count);
  renderWorksheet(problems);
  $("ws-title").textContent = `Math Worksheet — ${pack.label} (Grade ${pack.grade})`;
  saveSettings({ lastWorksheetPackId: pack.id });
  showScreen("print");
}
