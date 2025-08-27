import React, { useEffect, useMemo, useState } from "react";
import { toPng } from "html-to-image";

/**
 * Multi-Period Seating Chart (Names + Photos)
 * -------------------------------------------
 * • 6 rows × 3 paired columns (6×6 desks) with spacer columns
 * • Each period has its own page (tab)
 * • Randomize or Sort A→Z seating
 * • Manual drag-and-drop swap
 * • Shows Name + Photo on each desk
 * • Persistent in localStorage (state + seat assignments + layout)
 * • Import/Export helpers exist (buttons hidden per your request)
 * • Download PNG + Print (both include title; print hides header/nav)
 * • Teacher-only "Seat Tags" view: draggable tag chips -> seats; hidden from PNG/Print/exported views
 */

const PERIOD_KEYS = ["p1", "p3", "p4", "p5", "p6"] as const;
const DEFAULT_PERIOD_TITLES: Record<(typeof PERIOD_KEYS)[number], string> = {
  p1: "Period 1",
  p3: "Period 3",
  p4: "Period 4",
  p5: "Period 5",
  p6: "Period 6",
};

type PeriodKey = (typeof PERIOD_KEYS)[number];

type Student = {
  id: string;
  name: string;
  photo: string;
  tags: string[];
};

type Roster = Student[];

const ROWS = 6;
const COLS = 6;

const LS_KEY = "sb_multi_period_seating_v1";

function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveState(state: AppState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {}
}

/* ---------- Rules types ---------- */
type ApartRule = { aId: string; bId: string };
type TogetherRule = { aId: string; bId: string };
type PeriodRules = { apart: ApartRule[]; together: TogetherRule[] };

/* ---------- App state ---------- */
interface AppState {
  periods: Record<PeriodKey, Roster>;
  titles: Record<PeriodKey, string>;
  rules: Record<PeriodKey, PeriodRules>;
  /** Persisted seat assignments (same device) */
  seats: Record<PeriodKey, (Student | null)[]>;
  /** Teacher-only seat tag constraints (per seat, per period); [] or null = no restriction */
  seatTags: Record<PeriodKey, (string[] | null)[]>;
  /** Teacher-only global tag palette for dragging onto seats */
  seatTagLibrary: string[];
}

/* ---------- Utility helpers ---------- */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function padToSeats(
  roster: Roster | (Student | null)[],
  seatCount = ROWS * COLS
): (Student | null)[] {
  const base = roster.slice(0, seatCount) as (Student | null)[];
  const out: (Student | null)[] = base;
  while (out.length < seatCount) out.push(null);
  return out;
}
function uniqLower(list: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of list) {
    const v = (s || "").trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/* ---------- Photo manifests (lowercase-only + base-aware) ---------- */
function stemToDisplay(stem: string) {
  return stem.replace(/_/g, " ");
}

const BASE = (import.meta as any).env?.BASE_URL || "/";
function joinBase(...parts: string[]) {
  const b = BASE.endsWith("/") ? BASE : BASE + "/";
  return b + parts.map((p) => p.replace(/^\/+|\/+$/g, "")).join("/");
}

async function loadPeriodFromManifest(period: "p1" | "p3" | "p4" | "p5" | "p6") {
  const folder = period.toLowerCase();
  const manifestUrl = joinBase("photos", folder, "index.json");

  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`${period} manifest not found`);

  const files: string[] = await res.json();
  const basePath = joinBase("photos", folder) + "/";

  return files.map((filename) => {
    const stem = filename.replace(/\.[^.]+$/, "");
    return {
      id: stem,
      name: stemToDisplay(stem),
      photo: basePath + filename,
      tags: [], // students default with no tags
    } as Student;
  });
}

/* ---------- Rule math helpers ---------- */
function indexToRowCol(idx: number) {
  const row = Math.floor(idx / COLS);
  const col = idx % COLS;
  return { row, col };
}
function pairKeyForIndex(idx: number) {
  const { row, col } = indexToRowCol(idx);
  const pair = Math.floor(col / 2);
  return `${row}-${pair}`;
}
function findSeatIndexById(arr: (Student | null)[], id: string): number {
  return arr.findIndex((s) => s && s.id === id);
}
function countConflicts(
  arr: (Student | null)[],
  rules: PeriodRules,
  seatTags?: (string[] | null)[]
): number {
  let conflicts = 0;
  // apart rules
  for (const r of rules.apart) {
    if (!r.aId || !r.bId) continue;
    const ai = findSeatIndexById(arr, r.aId);
    const bi = findSeatIndexById(arr, r.bId);
    if (ai < 0 || bi < 0) continue;
    if (pairKeyForIndex(ai) === pairKeyForIndex(bi)) conflicts++;
  }
  // together rules
  for (const r of rules.together) {
    if (!r.aId || !r.bId) continue;
    const ai = findSeatIndexById(arr, r.aId);
    const bi = findSeatIndexById(arr, r.bId);
    if (ai < 0 || bi < 0) {
      conflicts++;
      continue;
    }
    if (pairKeyForIndex(ai) !== pairKeyForIndex(bi)) conflicts++;
  }
  // seat tag mismatches (ANY-of match; empty seat = no conflict)
  if (seatTags && seatTags.length === ROWS * COLS) {
    for (let i = 0; i < seatTags.length; i++) {
      const req = seatTags[i];
      if (!req || req.length === 0) continue;
      const occ = arr[i];
      if (!occ) continue;
      const have = uniqLower(occ.tags || []);
      const need = uniqLower(req);
      let ok = false;
      for (const t of need) {
        if (have.includes(t)) {
          ok = true;
          break;
        }
      }
      if (!ok) conflicts++;
    }
  }
  return conflicts;
}

/* ---------- Defaults & state shape fixup ---------- */
const EMPTY_STATE: AppState = {
  periods: { p1: [], p3: [], p4: [], p5: [], p6: [] },
  titles: { ...DEFAULT_PERIOD_TITLES },
  rules: {
    p1: { apart: [], together: [] },
    p3: { apart: [], together: [] },
    p4: { apart: [], together: [] },
    p5: { apart: [], together: [] },
    p6: { apart: [], together: [] },
  },
  seats: {
    p1: [],
    p3: [],
    p4: [],
    p5: [],
    p6: [],
  },
  seatTags: {
    p1: Array(ROWS * COLS).fill([]),
    p3: Array(ROWS * COLS).fill([]),
    p4: Array(ROWS * COLS).fill([]),
    p5: Array(ROWS * COLS).fill([]),
    p6: Array(ROWS * COLS).fill([]),
  },
  seatTagLibrary: [], // teacher-defined palette, global
};

function ensureRulesShape(s: AppState | null): AppState {
  if (!s) return EMPTY_STATE;
  const base: AppState = {
    periods: s.periods || EMPTY_STATE.periods,
    titles: s.titles || EMPTY_STATE.titles,
    rules: s.rules || EMPTY_STATE.rules,
    seats: s.seats || EMPTY_STATE.seats,
    seatTags: s.seatTags || EMPTY_STATE.seatTags,
    seatTagLibrary: Array.isArray((s as any).seatTagLibrary)
      ? uniqLower((s as any).seatTagLibrary)
      : EMPTY_STATE.seatTagLibrary,
  };
  for (const k of PERIOD_KEYS) {
    base.rules[k] ||= { apart: [], together: [] };
    base.rules[k].apart ||= [];
    base.rules[k].together ||= [];
    base.seats[k] ||= [];
    const current = base.seatTags[k];
    if (!Array.isArray(current) || current.length !== ROWS * COLS) {
      const arr: (string[] | null)[] = Array(ROWS * COLS);
      for (let i = 0; i < ROWS * COLS; i++) arr[i] = [];
      base.seatTags[k] = arr;
    } else {
      base.seatTags[k] = current.map((v) => (v == null ? [] : uniqLower(v)));
    }
  }
  return base;
}

/* ---------- Layout settings (persisted) ---------- */
type LayoutSettings = {
  withinPairGap: number;
  pairGap: number;
  rowGap: number;
  cardWidth: number;
  cardMinHeight: number;
  cardPadding: number;
  photoWidth: number;
  photoHeight: number;
  photoTopMargin: number;
};
const LAYOUT_LS_KEY = "sb_layout_v1";
const DEFAULT_LAYOUT: LayoutSettings = {
  withinPairGap: 8,
  pairGap: 22,
  rowGap: 14,
  cardWidth: 120,
  cardMinHeight: 156,
  cardPadding: 8,
  photoWidth: 100,
  photoHeight: 120,
  photoTopMargin: 6,
};
function loadLayout(): LayoutSettings {
  try {
    const raw = localStorage.getItem(LAYOUT_LS_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_LAYOUT, ...parsed };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/* =================================================================== */

export default function App() {
  const [state, setState] = useState<AppState>(() =>
    ensureRulesShape(loadState() ?? EMPTY_STATE)
  );
  const [active, setActive] = useState<PeriodKey>("p1");

  // Build initial seat maps from persisted seats or from roster
  const initialAssignments = useMemo(() => {
    const rec: Record<PeriodKey, (Student | null)[]> = {} as any;
    for (const k of PERIOD_KEYS) {
      const persisted = (state.seats?.[k] ?? []).filter(
        (s) => s === null || typeof s === "object"
      );
      rec[k] =
        persisted.length === ROWS * COLS ? persisted : padToSeats(state.periods[k]);
    }
    return rec;
  }, []); // run once on mount

  const [assignments, setAssignmentsInner] = useState<
    Record<PeriodKey, (Student | null)[]>
  >(initialAssignments);

  // teacher-only UI state
  const [seatTagsOpen, setSeatTagsOpen] = useState(false);
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null); // student drag
  const [dragTag, setDragTag] = useState<string | null>(null); // tag drag
  const [newTagText, setNewTagText] = useState("");

  // persist full state
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Assignments setter that also persists into state.seats
  function setAssignments(
    updater:
      | Record<PeriodKey, (Student | null)[]>
      | ((
          prev: Record<PeriodKey, (Student | null)[]>
        ) => Record<PeriodKey, (Student | null)[]>)
  ) {
    setAssignmentsInner((prev) => {
      const next = typeof updater === "function" ? (updater as any)(prev) : updater;
      setState((s) => ({ ...s, seats: next }));
      return next;
    });
  }

  /* ---------- Roster editing ---------- */
  function addStudent(period: PeriodKey) {
    const id = `student_${Date.now()}`;
    const newStudent: Student = { id, name: "First Last", photo: "", tags: [] };
    setState((s) => ({
      ...s,
      periods: { ...s.periods, [period]: [...s.periods[period], newStudent] },
    }));
    // place in first empty seat
    setAssignments((a) => {
      const arr = a[period].slice();
      const emptyIdx = arr.findIndex((x) => x === null);
      if (emptyIdx >= 0) arr[emptyIdx] = newStudent;
      else if (arr.length < ROWS * COLS) arr.push(newStudent);
      return { ...a, [period]: arr };
    });
  }

  function normalizeTagsInput(raw: string): string[] {
    return uniqLower(raw.split(/[;|,]/).map((t) => t.trim()));
  }

  function updateStudent(period: PeriodKey, idx: number, patch: Partial<Student>) {
    const p2: Partial<Student> = { ...patch };
    if (typeof (p2 as any).tags === "string") {
      (p2 as any).tags = normalizeTagsInput((p2 as any).tags);
    } else if (Array.isArray(p2.tags)) {
      p2.tags = uniqLower(p2.tags);
    }

    setState((s) => {
      const roster = s.periods[period].slice();
      const updated = { ...roster[idx], ...p2 };
      roster[idx] = updated;
      return { ...s, periods: { ...s.periods, [period]: roster } };
    });
    setAssignments((a) => {
      const rosterId = state.periods[period][idx]?.id;
      if (!rosterId) return a;
      const arr = a[period].map((seat) =>
        seat && seat.id === rosterId ? { ...seat, ...p2 } : seat
      );
      return { ...a, [period]: arr };
    });
  }

  function removeStudent(period: PeriodKey, idx: number) {
    const toRemove = state.periods[period][idx];
    setState((s) => {
      const roster = s.periods[period].slice();
      roster.splice(idx, 1);
      return { ...s, periods: { ...s.periods, [period]: roster } };
    });
    if (toRemove) {
      setAssignments((a) => {
        const arr = a[period].map((seat) =>
          seat && seat.id === toRemove.id ? null : seat
        );
        return { ...a, [period]: arr };
      });
    }
  }

  function updatePeriod(period: PeriodKey, roster: Roster) {
    setState((s) => ({ ...s, periods: { ...s.periods, [period]: roster } }));
    setAssignments((a) => {
      const arr = a[period].map((seat) =>
        seat && roster.find((r) => r.id === seat.id) ? seat : null
      );
      const seatedIds = new Set(arr.filter(Boolean).map((s) => (s as Student).id));
      for (const r of roster) {
        if (!seatedIds.has(r.id)) {
          const empty = arr.findIndex((x) => x === null);
          if (empty >= 0) arr[empty] = r;
        }
      }
      return { ...a, [period]: padToSeats(arr as (Student | null)[]) };
    });
  }

  /* ---------- Seating actions (students) ---------- */
  function randomize(period: PeriodKey) {
    const roster = state.periods[period];
    setAssignments((a) => ({ ...a, [period]: padToSeats(shuffle(roster)) }));
  }

  function sortAlpha(period: PeriodKey) {
    const roster = state.periods[period].slice();
    roster.sort((a, b) =>
      (a.name?.split(/\s+/)[0] || "").localeCompare(b.name?.split(/\s+/)[0] || "")
    );
    setState((s) => ({ ...s, periods: { ...s.periods, [period]: roster } }));
  }

  function handleStudentDragStart(idx: number) {
    setDragFromIdx(idx);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(targetIdx: number, e?: React.DragEvent) {
    // If we're dragging a tag in Seat Tags view, assign tag to seat instead of swapping students
    if (seatTagsOpen && dragTag) {
      addSeatTag(active, targetIdx, dragTag);
      setDragTag(null);
      e?.preventDefault();
      return;
    }
    // Otherwise perform student swap
    if (dragFromIdx === null || dragFromIdx === targetIdx) return;
    setAssignments((prev) => {
      const arr = prev[active].slice();
      [arr[dragFromIdx], arr[targetIdx]] = [arr[targetIdx], arr[dragFromIdx]];
      return { ...prev, [active]: arr };
    });
    setDragFromIdx(null);
  }

  /* ---------- Seat Tags: palette + per-seat assign/remove ---------- */
  function addSeatTag(period: PeriodKey, idx: number, tag: string) {
    const t = (tag || "").trim().toLowerCase();
    if (!t) return;
    const current = (state.seatTags[period] || []).slice();
    const list = Array.isArray(current[idx]) ? uniqLower(current[idx] as string[]) : [];
    if (!list.includes(t)) list.push(t);
    current[idx] = list;
    setState((s) => ({ ...s, seatTags: { ...s.seatTags, [period]: current } }));
  }
  function removeSeatTag(period: PeriodKey, idx: number, tag: string) {
    const t = (tag || "").trim().toLowerCase();
    const current = (state.seatTags[period] || []).slice();
    const list = Array.isArray(current[idx]) ? uniqLower(current[idx] as string[]) : [];
    const next = list.filter((x) => x !== t);
    current[idx] = next;
    setState((s) => ({ ...s, seatTags: { ...s.seatTags, [period]: current } }));
  }
  function addTagToLibrary(raw: string) {
    const t = (raw || "").trim().toLowerCase();
    if (!t) return;
    const lib = uniqLower([...(state.seatTagLibrary || []), t]);
    setState((s) => ({ ...s, seatTagLibrary: lib }));
    setNewTagText("");
  }

  /* ---------- Rules helpers ---------- */
  function rulesFor(p: PeriodKey): PeriodRules {
    return state.rules[p] || { apart: [], together: [] };
  }
  function setRules(p: PeriodKey, next: PeriodRules) {
    setState((s) => ({ ...s, rules: { ...s.rules, [p]: next } }));
  }
  function addApartRule(period: PeriodKey) {
    const r = rulesFor(period);
    setRules(period, { ...r, apart: [...r.apart, { aId: "", bId: "" }] });
  }
  function addTogetherRule(period: PeriodKey) {
    const r = rulesFor(period);
    setRules(period, { ...r, together: [...r.together, { aId: "", bId: "" }] });
  }
  function updateApart(period: PeriodKey, idx: number, patch: Partial<ApartRule>) {
    const r = rulesFor(period);
    const next = r.apart.slice();
    next[idx] = { ...next[idx], ...patch };
    setRules(period, { ...r, apart: next });
  }
  function updateTogether(period: PeriodKey, idx: number, patch: Partial<TogetherRule>) {
    const r = rulesFor(period);
    const next = r.together.slice();
    next[idx] = { ...next[idx], ...patch };
    setRules(period, { ...r, together: next });
  }
  function removeApart(period: PeriodKey, idx: number) {
    const r = rulesFor(period);
    const next = r.apart.slice();
    next.splice(idx, 1);
    setRules(period, { ...r, apart: next });
  }
  function removeTogether(period: PeriodKey, idx: number) {
    const r = rulesFor(period);
    const next = r.together.slice();
    next.splice(idx, 1);
    setRules(period, { ...r, together: next });
  }

  // “Apply rules” randomizer includes seat-tag conflicts
  function randomizeWithRules(period: PeriodKey) {
    const roster = state.periods[period];
    const rules = rulesFor(period);
    let best = padToSeats(roster);
    let bestConf = Number.POSITIVE_INFINITY;

    for (let t = 0; t < 1500; t++) {
      const arr = padToSeats(shuffle(roster));
      const conf = countConflicts(arr, rules, state.seatTags[period]);
      if (conf === 0) {
        setAssignments((a) => ({ ...a, [period]: arr }));
        return;
      }
      if (conf < bestConf) {
        bestConf = conf;
        best = arr;
      }
    }
    setAssignments((a) => ({ ...a, [period]: best }));
    if (bestConf > 0) {
      alert(
        `${bestConf} rule conflict(s) could not be satisfied; showing closest arrangement.`
      );
    }
  }

  function checkConflicts(period: PeriodKey) {
    const conflicts = countConflicts(
      assignments[period],
      rulesFor(period),
      state.seatTags[period]
    );
    alert(
      conflicts === 0
        ? "No rule/seat-tag conflicts in the current layout."
        : `${conflicts} conflict(s) detected.`
    );
  }

  /* ---------- Layout persistence ---------- */
  const [layout, setLayout] = useState<LayoutSettings>(() => loadLayout());
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [studentsOpen, setStudentsOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});


  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_LS_KEY, JSON.stringify(layout));
    } catch {}
  }, [layout]);

  function resetLayout() {
    setLayout(DEFAULT_LAYOUT);
  }

  const seatCol = `${layout.cardWidth}px`;
  const gridTemplateColumns = [
    seatCol,
    seatCol,
    `${layout.pairGap}px`,
    seatCol,
    seatCol,
    `${layout.pairGap}px`,
    seatCol,
    seatCol,
  ].join(" ");

  /* ---------- PNG: hide teacher-only elements ---------- */
  async function downloadPNG() {
    const node = document.getElementById("chartCapture");
    if (!node) return;
    const dataUrl = await toPng(node as HTMLElement, {
      pixelRatio: 2,
      filter: (el: any) =>
        !(el instanceof Element && el.classList.contains("teacher-only")),
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${state.titles[active].replace(/\s+/g, "_").toLowerCase()}_seating.png`;
    a.click();
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* PRINT CSS */}
      <style>
        {`
        @media print {
          @page { size: letter landscape; margin: 0.5in; }
          body * { visibility: hidden !important; }
          #chartCapture, #chartCapture * { visibility: visible !important; }
          header, .no-print, .print-hide { display: none !important; }
          /* teacher-only elements hidden from print even inside chartCapture */
          #chartCapture .teacher-only { display: none !important; visibility: hidden !important; }
          #chartCapture {
            position: absolute; left: 0; top: 0;
            width: 100% !important; max-width: 100% !important;
            box-shadow: none !important; border: none !important;
          }
          html, body { background: #ffffff !important; }
        }
        `}
      </style>

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3 whitespace-nowrap overflow-x-auto">
          <span className="text-2xl font-bold shrink-0">Seating Chart</span>

          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 overflow-x-auto">
              {PERIOD_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => setActive(key)}
                  className={
                    "px-3 py-1.5 rounded-xl border text-sm " +
                    (active === key
                      ? "bg-black text-white border-black"
                      : "bg-white hover:bg-gray-50")
                  }
                >
                  {state.titles[key]}
                </button>
              ))}
            </div>
            <button
              onClick={async () => {
                try {
                  const results = await Promise.all([
                    loadPeriodFromManifest("p1"),
                    loadPeriodFromManifest("p3"),
                    loadPeriodFromManifest("p4"),
                    loadPeriodFromManifest("p5"),
                    loadPeriodFromManifest("p6"),
                  ]);
                  const [p1, p3, p4, p5, p6] = results;
                  const nextPeriods = { p1, p3, p4, p5, p6 } as Record<
                    PeriodKey,
                    Roster
                  >;
                  setState((s) => ({ ...s, periods: nextPeriods }));
                  setAssignments((a) => {
                    const out: Record<PeriodKey, (Student | null)[]> = { ...a };
                    for (const k of PERIOD_KEYS) {
                      const seated = new Set(
                        out[k].filter(Boolean).map((s) => (s as Student).id)
                      );
                      for (const stu of nextPeriods[k]) {
                        if (!seated.has(stu.id)) {
                          const empty = out[k].findIndex((x) => x === null);
                          if (empty >= 0) out[k][empty] = stu;
                        }
                      }
                      out[k] = padToSeats(out[k]);
                    }
                    return out;
                  });
                  alert("Rosters loaded from photo manifests.");
                } catch (e: any) {
                  alert(e?.message || "Could not load one or more manifests.");
                }
              }}
              className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50 shrink-0"
            >
              Load Rosters From Photos
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 gap-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => randomizeWithRules(active)}
              className="px-3 py-1.5 rounded-xl bg-blue-600 text-white"
            >
              Randomize
            </button>
            <button onClick={() => sortAlpha(active)} className="px-3 py-1.5 rounded-xl border">
              Sort A→Z
            </button>
            <button onClick={downloadPNG} className="px-3 py-1.5 rounded-xl border">
              Download PNG
            </button>
            <button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl border">
              Print
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setStudentsOpen((v) => !v)}
              className={
                "px-3 py-1.5 rounded-xl border " +
                (studentsOpen ? "bg-black text-white" : "bg-white")
              }
              title="Edit roster (names)"
            >
              Students
            </button>
            <button
              onClick={() => setRulesOpen((v) => !v)}
              className={
                "px-3 py-1.5 rounded-xl border " +
                (rulesOpen ? "bg-black text-white" : "bg-white")
              }
              title="Edit rules (keep apart / keep together)"
            >
              Rules
            </button>
            <button
              onClick={() => setSeatTagsOpen((v) => !v)}
              className={
                "px-3 py-1.5 rounded-xl border " +
                (seatTagsOpen ? "bg-black text-white" : "bg-white")
              }
              title="Seat Tags (teacher-only drag & drop)"
            >
              Seat Tags
            </button>
            <button
              onClick={() => setLayoutOpen((v) => !v)}
              className={
                "px-3 py-1.5 rounded-xl border " +
                (layoutOpen ? "bg-black text-white" : "bg-white")
              }
              title="Layout settings (spacing & sizes)"
            >
              Layout
            </button>
          </div>
        </div>

        {/* STUDENTS (roster) PANEL */}
        {studentsOpen && (
          <section className="bg-white rounded-2xl shadow border p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">
                {state.titles[active]} — Students
              </h2>
              <button
                onClick={() => addStudent(active)}
                className="px-3 py-1.5 rounded-xl border"
              >
                Add Student
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2">#</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Tags (;-separated)</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.periods[active].length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-gray-500">
                        No students yet.
                      </td>
                    </tr>
                  )}
                  {state.periods[active].map((s, i) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2 text-gray-500">{i + 1}</td>
                      <td className="p-2">
                        <input
                          value={s.name}
                          onChange={(e) =>
                            updateStudent(active, i, { name: e.target.value })
                          }
                          className="w-full border px-2 py-1"
                        />
                      </td>
                     <input
  value={tagDrafts[s.id] ?? (s.tags || []).join("; ")}
  onChange={(e) => setTagDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
  onBlur={(e) => {
    updateStudent(active, i, { tags: e.target.value }); // parses ; , |
    setTagDrafts((d) => {
      const { [s.id]: _remove, ...rest } = d;
      return rest;
    });
  }}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      const val = (e.target as HTMLInputElement).value;
      updateStudent(active, i, { tags: val });
      setTagDrafts((d) => {
        const { [s.id]: _remove, ...rest } = d;
        return rest;
      });
    }
  }}
  className="w-full border px-2 py-1"
  placeholder="iep; 504; el"
/>

                      <td className="p-2">
                        <button
                          onClick={() => removeStudent(active, i)}
                          className="px-2 py-1 border"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Quick Paste */}
            <div className="mt-4 bg-white rounded-2xl border p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Quick Paste Roster</h3>
                <button
                  onClick={() => {
                    const rows = pasteText
                      .split(/\r?\n/)
                      .map((l) => l.trim())
                      .filter(Boolean);
                    const roster: Roster = rows.map((line, i) => {
                      const parts = line.split(/,\s*/);
                      const name = parts[0] ?? "";
                      const photo = parts[1] ?? "";
                      const tagStr = parts[2] ?? "";
                      const tags =
                        tagStr.length > 0
                          ? uniqLower(
                              tagStr.split(/[;|,]/).map((t) => t.trim())
                            )
                          : [];
                      const id =
                        name.toLowerCase().replace(/[^a-z0-9]+/g, "_") ||
                        `s_${i}`;
                      return { id, name, photo, tags };
                    });
                    updatePeriod(active, roster);
                    setPasteText("");
                  }}
                  className="px-3 py-1.5 rounded-xl bg-black text-white"
                >
                  Apply
                </button>
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                className="w-full border px-2 py-2 font-mono text-xs"
              />
              <div className="text-xs text-gray-500 mt-1">
                Format per line: <code>Name, photoURL, tag1;tag2</code> (tags
                optional)
              </div>
            </div>
          </section>
        )}

        {/* RULES PANEL */}
        {rulesOpen && (
          <div className="mb-2 bg-white rounded-2xl shadow border p-3">
            <div className="space-y-6">
              {/* Apart */}
              <div>
                <h3 className="font-semibold mb-1">Keep Apart Rules</h3>
                <p className="text-sm text-gray-500 mb-2">
                  Keep these students out of the same two-seat pair.
                </p>
                <div className="space-y-2">
                  {rulesFor(active).apart.map((r, i) => (
                    <div
                      key={`apart-${i}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <select
                        className="border rounded-lg px-2 py-1 flex-1 min-w-[200px]"
                        value={r.aId}
                        onChange={(e) =>
                          updateApart(active, i, { aId: e.target.value })
                        }
                      >
                        <option value="">— Select —</option>
                        {state.periods[active].map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <span className="text-gray-500">and</span>
                      <select
                        className="border rounded-lg px-2 py-1 flex-1 min-w=[200px]"
                        value={r.bId}
                        onChange={(e) =>
                          updateApart(active, i, { bId: e.target.value })
                        }
                      >
                        <option value="">— Select —</option>
                        {state.periods[active].map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="px-2 py-1 border rounded-lg"
                        onClick={() => removeApart(active, i)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50"
                  onClick={() => addApartRule(active)}
                >
                  + Keep Apart Rule
                </button>
              </div>

              {/* Together */}
              <div>
                <h3 className="font-semibold mb-1">Keep Together Rules</h3>
                <p className="text-sm text-gray-500 mb-2">
                  Seat these students in the same two-seat pair.
                </p>
                <div className="space-y-2">
                  {rulesFor(active).together.map((r, i) => (
                    <div
                      key={`together-${i}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <select
                        className="border rounded-lg px-2 py-1 flex-1 min-w-[200px]"
                        value={r.aId}
                        onChange={(e) =>
                          updateTogether(active, i, { aId: e.target.value })
                        }
                      >
                        <option value="">— Select —</option>
                        {state.periods[active].map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <span className="text-gray-500">with</span>
                      <select
                        className="border rounded-lg px-2 py-1 flex-1 min-w-[200px]"
                        value={r.bId}
                        onChange={(e) =>
                          updateTogether(active, i, { bId: e.target.value })
                        }
                      >
                        <option value="">— Select —</option>
                        {state.periods[active].map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="px-2 py-1 border rounded-lg"
                        onClick={() => removeTogether(active, i)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50"
                  onClick={() => addTogetherRule(active)}
                >
                  + Keep Together Rule
                </button>
              </div>

              <div className="pt-2 border-t flex flex-wrap items-center gap-2">
                <button
                  className="mt-2 px-3 py-1.5 rounded-xl border"
                  onClick={() => alert("Rules saved.")}
                >
                  Save Rules
                </button>
                <button
                  className="mt-2 px-3 py-1.5 rounded-xl border"
                  onClick={() => checkConflicts(active)}
                >
                  Check Conflicts
                </button>
              </div>
            </div>
          </div>
        )}

        {/* NEW: SEAT TAGS PALETTE (teacher-only) */}
        {seatTagsOpen && (
          <div className="mb-2 bg-white rounded-2xl shadow border p-3 no-print teacher-only">
            <h3 className="font-semibold mb-2">
              Seat Tags — Drag a tag chip onto a seat
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {state.seatTagLibrary.length === 0 && (
                <span className="text-sm text-gray-500">
                  No tags yet — add one below.
                </span>
              )}
              {state.seatTagLibrary.map((tag) => (
                <TagChip
                  key={tag}
                  label={tag}
                  onDragStart={() => setDragTag(tag)}
                  onDragEnd={() => setDragTag(null)}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={newTagText}
                onChange={(e) => setNewTagText(e.target.value)}
                placeholder="Add new tag (e.g., iep)"
                className="border rounded-xl px-3 py-1.5"
              />
              <button
                className="px-3 py-1.5 rounded-xl border"
                onClick={() => addTagToLibrary(newTagText)}
              >
                Add Tag
              </button>
              <button
                className="px-3 py-1.5 rounded-xl border"
                onClick={() => checkConflicts(active)}
              >
                Check Conflicts
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Tip: While the Seat Tags view is open, seat tag pills are visible on
              each desk and can be removed with the × button. These never appear
              in PNG or Print.
            </div>
          </div>
        )}

        {/* LAYOUT PANEL */}
        {layoutOpen && (
          <div className="mb-2 bg-white rounded-2xl shadow border p-3">
            <div className="flex flex-wrap gap-4">
              <NumberField
                label="Within-pair gap (px)"
                value={layout.withinPairGap}
                onChange={(v) =>
                  setLayout({ ...layout, withinPairGap: clampInt(v, 0, 64) })
                }
              />
              <NumberField
                label="Between-pairs gap (px)"
                value={layout.pairGap}
                onChange={(v) =>
                  setLayout({ ...layout, pairGap: clampInt(v, 0, 120) })
                }
              />
              <NumberField
                label="Row gap (px)"
                value={layout.rowGap}
                onChange={(v) =>
                  setLayout({ ...layout, rowGap: clampInt(v, 0, 64) })
                }
              />
              <NumberField
                label="Card width (px)"
                value={layout.cardWidth}
                onChange={(v) =>
                  setLayout({ ...layout, cardWidth: clampInt(v, 80, 220) })
                }
              />
              <NumberField
                label="Card min-height (px)"
                value={layout.cardMinHeight}
                onChange={(v) =>
                  setLayout({ ...layout, cardMinHeight: clampInt(v, 120, 260) })
                }
              />
              <NumberField
                label="Card padding (px)"
                value={layout.cardPadding}
                onChange={(v) =>
                  setLayout({ ...layout, cardPadding: clampInt(v, 4, 20) })
                }
              />
              <NumberField
                label="Photo width (px)"
                value={layout.photoWidth}
                onChange={(v) =>
                  setLayout({
                    ...layout,
                    photoWidth: clampInt(v, 60, layout.cardWidth - 8),
                  })
                }
              />
              <NumberField
                label="Photo height (px)"
                value={layout.photoHeight}
                onChange={(v) =>
                  setLayout({ ...layout, photoHeight: clampInt(v, 60, 240) })
                }
              />
              <NumberField
                label="Photo top margin (px)"
                value={layout.photoTopMargin}
                onChange={(v) =>
                  setLayout({ ...layout, photoTopMargin: clampInt(v, 0, 24) })
                }
              />
            </div>
            <div className="mt-3">
              <button onClick={resetLayout} className="px-3 py-1.5 rounded-xl border">
                Reset to defaults
              </button>
            </div>
          </div>
        )}

        {/* CHART */}
        <div
          id="chartCapture"
          className="bg-white rounded-2xl shadow p-4 border mx-auto w-full"
        >
          <div className="text-center text-xl font-semibold mb-2">
            {state.titles[active]} — Seating Chart
          </div>
          <div className="text-center text-base text-gray-500 mb-2">
            Front of classroom
          </div>

          <div
            className="grid"
            style={{
              gridTemplateColumns, // 2 seats + spacer + 2 seats + spacer + 2 seats
              columnGap: `${layout.withinPairGap}px`,
              rowGap: `${layout.rowGap}px`,
              justifyContent: "center" as const,
            }}
          >
            {Array.from({ length: ROWS }).map((_, r) => (
              <React.Fragment key={r}>
                {Array.from({ length: 8 }).map((__, vcol) => {
                  if (vcol === 2 || vcol === 5)
                    return <div key={`s-${r}-${vcol}`} />;
                  let logicalCol = vcol;
                  if (vcol >= 6) logicalCol -= 2;
                  else if (vcol >= 3) logicalCol -= 1;
                  const seatIndex = r * COLS + logicalCol;
                  const seat = assignments[active][seatIndex] || null;
                  const tagsForSeat =
                    (state.seatTags[active][seatIndex] as string[]) || [];
                  return (
                    <DeskCard
                      key={`d-${r}-${vcol}`}
                      student={seat}
                      onDragStart={() => handleStudentDragStart(seatIndex)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(seatIndex, e)}
                      layout={layout}
                      showSeatTags={seatTagsOpen}
                      seatTagList={tagsForSeat}
                      onRemoveSeatTag={(tag) =>
                        removeSeatTag(active, seatIndex, tag)
                      }
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- Small helper component for numeric inputs ---------- */
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-sm">
      <div className="text-gray-600 mb-1">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="border rounded-lg px-2 py-1 w-32"
      />
    </label>
  );
}
function clampInt(v: number, min: number, max: number) {
  v = Math.round(v);
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/* ---------- Tag chip (palette) ---------- */
function TagChip({
  label,
  onDragStart,
  onDragEnd,
}: {
  label: string;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", label);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="teacher-only select-none cursor-grab inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs bg-white"
      title="Drag onto a seat"
    >
      <span className="font-mono">{label}</span>
      <span className="opacity-60">⠿</span>
    </span>
  );
}

/* ---------- Seat card ---------- */
function DeskCard({
  student,
  onDragStart,
  onDragOver,
  onDrop,
  layout,
  showSeatTags,
  seatTagList,
  onRemoveSeatTag,
}: {
  student: Student | null;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  layout: {
    cardWidth: number;
    cardMinHeight: number;
    cardPadding: number;
    photoWidth: number;
    photoHeight: number;
    photoTopMargin: number;
  };
  showSeatTags: boolean;
  seatTagList: string[];
  onRemoveSeatTag: (tag: string) => void;
}) {
  return (
    <div
      className={
        "rounded-2xl border shadow-sm bg-white flex flex-col items-center justify-start relative"
      }
      style={{
        width: `${layout.cardWidth}px`,
        minHeight: `${layout.cardMinHeight}px`,
        padding: `${layout.cardPadding}px`,
      }}
      draggable={!!student}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={student?.name || ""} // full name on hover
    >
      <div
        className="rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center"
        style={{
          width: `${layout.photoWidth}px`,
          height: `${layout.photoHeight}px`,
          marginTop: `${layout.photoTopMargin}px`,
        }}
      >
        {student?.photo ? (
          <img
            src={student.photo}
            alt={student.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-xs text-gray-400">No Photo</div>
        )}
      </div>

      <div className="mt-1 w-full px-1 text-center leading-tight text-xs break-words">
        {student?.name || "(empty)"}
      </div>

      {/* Teacher-only seat tag pills (only visible when seatTagsOpen) */}
      {showSeatTags && (
        <div className="teacher-only absolute left-1 right-1 bottom-1 flex flex-wrap gap-1 justify-center pointer-events-auto">
          {seatTagList.map((t) => (
            <button
              key={t}
              type="button"
              className="text-[10px] px-2 py-0.5 rounded-full border bg-white/90 hover:bg-white"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveSeatTag(t);
              }}
              title="Remove tag from this seat"
            >
              {t} <span className="ml-1">×</span>
            </button>
          ))}
          {seatTagList.length === 0 && (
            <span className="text-[10px] text-gray-400 select-none">(no tags)</span>
          )}
        </div>
      )}
    </div>
  );
}
