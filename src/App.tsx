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
 */

const PERIOD_KEYS = ["p1", "p3", "p4", "p5", "p6"] as const;
const DEFAULT_PERIOD_TITLES: Record<typeof PERIOD_KEYS[number], string> = {
  p1: "Period 1",
  p3: "Period 3",
  p4: "Period 4",
  p5: "Period 5",
  p6: "Period 6",
};

type PeriodKey = typeof PERIOD_KEYS[number];

type Student = {
  id: string;
  name: string;
  photo: string;
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
function padToSeats(roster: Roster, seatCount = ROWS * COLS): (Student | null)[] {
  const out: (Student | null)[] = roster.slice(0, seatCount);
  while (out.length < seatCount) out.push(null);
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
function countConflicts(arr: (Student | null)[], rules: PeriodRules): number {
  let conflicts = 0;
  for (const r of rules.apart) {
    if (!r.aId || !r.bId) continue;
    const ai = findSeatIndexById(arr, r.aId);
    const bi = findSeatIndexById(arr, r.bId);
    if (ai < 0 || bi < 0) continue;
    if (pairKeyForIndex(ai) === pairKeyForIndex(bi)) conflicts++;
  }
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
};

function ensureRulesShape(s: AppState | null): AppState {
  if (!s) return EMPTY_STATE;
  const base: AppState = {
    periods: s.periods || EMPTY_STATE.periods,
    titles: s.titles || EMPTY_STATE.titles,
    rules: s.rules || EMPTY_STATE.rules,
    seats: s.seats || EMPTY_STATE.seats,
  };
  for (const k of PERIOD_KEYS) {
    base.rules[k] ||= { apart: [], together: [] };
    base.rules[k].apart ||= [];
    base.rules[k].together ||= [];
    base.seats[k] ||= [];
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
      const persisted = (state.seats?.[k] ?? []).filter((s) => s === null || typeof s === "object");
      rec[k] =
        persisted.length === ROWS * COLS
          ? persisted
          : padToSeats(state.periods[k]);
    }
    return rec;
  }, []); // run once on mount

  const [assignments, setAssignmentsInner] = useState<
    Record<PeriodKey, (Student | null)[]>
  >(initialAssignments);

  // Helper so any seat change also persists into state.seats (and localStorage via saveState)
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

  useEffect(() => {
    saveState(state);
  }, [state]);

  /* ---------- Roster editing ---------- */
  function addStudent(period: PeriodKey) {
    const id = `student_${Date.now()}`;
    const newStudent: Student = { id, name: "First Last", photo: "" };
    setState((s) => ({
      ...s,
      periods: { ...s.periods, [period]: [...s.periods[period], newStudent] },
    }));
    // Place new student in the first empty seat
    setAssignments((a) => {
      const arr = a[period].slice();
      const emptyIdx = arr.findIndex((x) => x === null);
      if (emptyIdx >= 0) arr[emptyIdx] = newStudent;
      else if (arr.length < ROWS * COLS) arr.push(newStudent);
      return { ...a, [period]: arr };
    });
  }

  function updateStudent(period: PeriodKey, idx: number, patch: Partial<Student>) {
    // Update roster entry
    setState((s) => {
      const roster = s.periods[period].slice();
      const updated = { ...roster[idx], ...patch };
      roster[idx] = updated;
      return { ...s, periods: { ...s.periods, [period]: roster } };
    });
    // Update whichever seat currently has this student's id (no reshuffle)
    setAssignments((a) => {
      const rosterId = state.periods[period][idx]?.id;
      if (!rosterId) return a;
      const arr = a[period].map((seat) =>
        seat && seat.id === rosterId ? { ...seat, ...patch } : seat
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
    // Remove from seat map but keep everyone else in place
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
    // Only used by JSON import/paste wizard; keep seats as close as possible
    setState((s) => ({ ...s, periods: { ...s.periods, [period]: roster } }));
    // Try to map existing seats by id to the new roster; unknowns become null;
    setAssignments((a) => {
      const arr = a[period].map((seat) =>
        seat && roster.find((r) => r.id === seat.id) ? seat : null
      );
      // fill remaining roster items not already seated into empty spots
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

  /* ---------- Seating actions ---------- */
  function randomize(period: PeriodKey) {
    const roster = state.periods[period];
    setAssignments((a) => ({ ...a, [period]: padToSeats(shuffle(roster)) }));
  }

  function sortAlpha(period: PeriodKey) {
    const roster = state.periods[period].slice();
    roster.sort((a, b) =>
      (a.name?.split(/\s+/)[0] || "").localeCompare(b.name?.split(/\s+/)[0] || "")
    );
    // Just reorder roster list; DO NOT reseat automatically
    setState((s) => ({ ...s, periods: { ...s.periods, [period]: roster } }));
  }

  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  function handleDragStart(idx: number) {
    setDragFromIdx(idx);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(targetIdx: number) {
    if (dragFromIdx === null || dragFromIdx === targetIdx) return;
    setAssignments((prev) => {
      const arr = prev[active].slice();
      [arr[dragFromIdx], arr[targetIdx]] = [arr[targetIdx], arr[dragFromIdx]];
      return { ...prev, [active]: arr };
    });
    setDragFromIdx(null);
  }

  async function downloadPNG() {
    const node = document.getElementById("chartCapture");
    if (!node) return;
    const dataUrl = await toPng(node as HTMLElement, { pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${state.titles[active].replace(/\s+/g, "_").toLowerCase()}_seating.png`;
    a.click();
  }

  // Import/Export helpers (buttons removed per request, but keep functions)
  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "seating_state.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(String(reader.result));
        if (incoming?.periods && incoming?.titles) {
          const normalized = ensureRulesShape(incoming);
          // If seats are in the incoming, prefer those; otherwise keep current seats
          const nextSeats: AppState["seats"] = { ...state.seats };
          for (const k of PERIOD_KEYS) {
            nextSeats[k] =
              normalized.seats?.[k]?.length === ROWS * COLS
                ? normalized.seats[k]
                : assignments[k];
          }
          setState({
            ...normalized,
            seats: nextSeats,
          });
          setAssignments(nextSeats);
        }
      } catch {
        alert("Invalid JSON");
      }
    };
    reader.readAsText(f);
  }

  /* ---------- Paste Wizard ---------- */
  const [pasteText, setPasteText] = useState("");
  function applyPaste(period: PeriodKey) {
    const rows = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const roster: Roster = rows.map((line, i) => {
      const [name, photo = ""] = line.split(/,\s*/);
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `s_${i}`;
      return { id, name, photo };
    });
    updatePeriod(period, roster);
    setPasteText("");
  }

  /* ---------- Load rosters from photo manifests ---------- */
  async function loadRostersFromPhotos() {
    try {
      const results = await Promise.all([
        loadPeriodFromManifest("p1"),
        loadPeriodFromManifest("p3"),
        loadPeriodFromManifest("p4"),
        loadPeriodFromManifest("p5"),
        loadPeriodFromManifest("p6"),
      ]);
      const [p1, p3, p4, p5, p6] = results;
      const nextPeriods = { p1, p3, p4, p5, p6 } as Record<PeriodKey, Roster>;
      setState((s) => ({ ...s, periods: nextPeriods }));
      // Keep current seat shapes; fill empty spots with new names where possible
      setAssignments((a) => {
        const out: Record<PeriodKey, (Student | null)[]> = { ...a };
        for (const k of PERIOD_KEYS) {
          const seated = new Set(out[k].filter(Boolean).map((s) => (s as Student).id));
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

  // Manual “apply rules”: randomize attempting to satisfy rules (no auto changes while editing)
  function randomizeWithRules(period: PeriodKey) {
    const roster = state.periods[period];
    const rules = rulesFor(period);
    let best = padToSeats(roster);
    let bestConf = Number.POSITIVE_INFINITY;

    for (let t = 0; t < 1500; t++) {
      const arr = padToSeats(shuffle(roster));
      const conf = countConflicts(arr, rules);
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
      alert(`${bestConf} rule conflict(s) could not be satisfied; showing closest arrangement.`);
    }
  }

  function checkConflicts(period: PeriodKey) {
    const conflicts = countConflicts(assignments[period], rulesFor(period));
    alert(conflicts === 0 ? "No rule conflicts in the current layout." : `${conflicts} conflict(s) detected.`);
  }

  /* ---------- UI state ---------- */
  const [layout, setLayout] = useState<LayoutSettings>(() => loadLayout());
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* PRINT CSS: print only the chartCapture, single page */}
      <style>
        {`
        @media print {
          @page { size: letter landscape; margin: 0.5in; }
          body * { visibility: hidden !important; }
          #chartCapture, #chartCapture * { visibility: visible !important; }
          header, nav, .no-print, .print-hide { display: none !important; }
          #chartCapture {
            position: absolute; left: 0; top: 0;
            width: 100% !important; max-width: 100% !important;
            box-shadow: none !important; border: none !important;
          }
          html, body { background: #ffffff !important; }
        }
      `}
      </style>

      {/* Header: single-line title + (optional) load photos button; NO subtitle/export/import */}
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between whitespace-nowrap">
          <span className="text-2xl font-bold">Seating Chart</span>
          <div className="flex items-center gap-2">
            <button
              onClick={loadRostersFromPhotos}
              className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50"
            >
              Load Rosters From Photos
            </button>
          </div>
        </div>
        {/* Period tabs (single line) */}
        <nav className="mx-auto max-w-6xl px-4 pb-3 flex gap-2 overflow-x-auto no-print">
          {PERIOD_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={
                "px-3 py-1.5 rounded-xl border text-sm " +
                (active === key ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50")
              }
            >
              {state.titles[key]}
            </button>
          ))}
        </nav>
      </header>

      {/* MAIN */}
      <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 gap-6">
        {/* Unified toolbar above the chart */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            {/* Randomize uses rules manually when you want */}
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
            {/* Toggle Rules panel (top, formatted like Layout) */}
            <button
              onClick={() => setRulesOpen((v) => !v)}
              className={"px-3 py-1.5 rounded-xl border " + (rulesOpen ? "bg-black text-white" : "bg-white")}
              title="Edit rules (keep apart / keep together)"
            >
              Rules
            </button>
            {/* Toggle Layout panel */}
            <button
              onClick={() => setLayoutOpen((v) => !v)}
              className={"px-3 py-1.5 rounded-xl border " + (layoutOpen ? "bg-black text-white" : "bg-white")}
              title="Layout settings (spacing & sizes)"
            >
              Layout
            </button>
          </div>
        </div>

        {/* RULES PANEL (collapsible, matches layout style) */}
        {rulesOpen && (
          <div className="mb-2 bg-white rounded-2xl shadow border p-3">
            <div className="space-y-6">
              {/* Keep Apart */}
              <div>
                <h3 className="font-semibold mb-1">Keep Apart Rules</h3>
                <p className="text-sm text-gray-500 mb-2">
                  Keep these students out of the same two-seat pair.
                </p>
                <div className="space-y-2">
                  {rulesFor(active).apart.map((r, i) => (
                    <div key={`apart-${i}`} className="flex flex-wrap items-center gap-2">
                      <select
                        className="border rounded-lg px-2 py-1 flex-1 min-w-[200px]"
                        value={r.aId}
                        onChange={(e) => updateApart(active, i, { aId: e.target.value })}
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
                        className="border rounded-lg px-2 py-1 flex-1 min-w-[200px]"
                        value={r.bId}
                        onChange={(e) => updateApart(active, i, { bId: e.target.value })}
                      >
                        <option value="">— Select —</option>
                        {state.periods[active].map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <button className="px-2 py-1 border rounded-lg" onClick={() => removeApart(active, i)}>
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

              {/* Keep Together */}
              <div>
                <h3 className="font-semibold mb-1">Keep Together Rules</h3>
                <p className="text-sm text-gray-500 mb-2">
                  Seat these students in the same two-seat pair.
                </p>
                <div className="space-y-2">
                  {rulesFor(active).together.map((r, i) => (
                    <div key={`together-${i}`} className="flex flex-wrap items-center gap-2">
                      <select
                        className="border rounded-lg px-2 py-1 flex-1 min-w-[200px]"
                        value={r.aId}
                        onChange={(e) => updateTogether(active, i, { aId: e.target.value })}
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
                        onChange={(e) => updateTogether(active, i, { bId: e.target.value })}
                      >
                        <option value="">— Select —</option>
                        {state.periods[active].map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <button className="px-2 py-1 border rounded-lg" onClick={() => removeTogether(active, i)}>
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

        {/* LAYOUT PANEL (collapsible) */}
        {layoutOpen && (
          <div className="mb-2 bg-white rounded-2xl shadow border p-3">
            <div className="flex flex-wrap gap-4">
              <NumberField
                label="Within-pair gap (px)"
                value={layout.withinPairGap}
                onChange={(v) => setLayout({ ...layout, withinPairGap: clampInt(v, 0, 64) })}
              />
              <NumberField
                label="Between-pairs gap (px)"
                value={layout.pairGap}
                onChange={(v) => setLayout({ ...layout, pairGap: clampInt(v, 0, 120) })}
              />
              <NumberField
                label="Row gap (px)"
                value={layout.rowGap}
                onChange={(v) => setLayout({ ...layout, rowGap: clampInt(v, 0, 64) })}
              />
              <NumberField
                label="Card width (px)"
                value={layout.cardWidth}
                onChange={(v) => setLayout({ ...layout, cardWidth: clampInt(v, 80, 220) })}
              />
              <NumberField
                label="Card min-height (px)"
                value={layout.cardMinHeight}
                onChange={(v) => setLayout({ ...layout, cardMinHeight: clampInt(v, 120, 260) })}
              />
              <NumberField
                label="Card padding (px)"
                value={layout.cardPadding}
                onChange={(v) => setLayout({ ...layout, cardPadding: clampInt(v, 4, 20) })}
              />
              <NumberField
                label="Photo width (px)"
                value={layout.photoWidth}
                onChange={(v) => setLayout({ ...layout, photoWidth: clampInt(v, 60, layout.cardWidth - 8) })}
              />
              <NumberField
                label="Photo height (px)"
                value={layout.photoHeight}
                onChange={(v) => setLayout({ ...layout, photoHeight: clampInt(v, 60, 240) })}
              />
              <NumberField
                label="Photo top margin (px)"
                value={layout.photoTopMargin}
                onChange={(v) => setLayout({ ...layout, photoTopMargin: clampInt(v, 0, 24) })}
              />
            </div>
            <div className="mt-3">
              <button onClick={resetLayout} className="px-3 py-1.5 rounded-xl border">
                Reset to defaults
              </button>
            </div>
          </div>
        )}

        {/* CHART (centered) */}
        <div id="chartCapture" className="bg-white rounded-2xl shadow p-4 border mx-auto w-full">
          {/* Title included in PNG and Print */}
          <div className="text-center text-xl font-semibold mb-2">
            {state.titles[active]} — Seating Chart
          </div>
          {/* Front of classroom label */}
          <div className="text-center text-xs text-gray-500 mb-2">Front of classroom</div>

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
                  if (vcol === 2 || vcol === 5) return <div key={`s-${r}-${vcol}`} />;
                  let logicalCol = vcol;
                  if (vcol >= 6) logicalCol -= 2;
                  else if (vcol >= 3) logicalCol -= 1;
                  const seatIndex = r * COLS + logicalCol;
                  const seat = assignments[active][seatIndex] || null;
                  return (
                    <DeskCard
                      key={`d-${r}-${vcol}`}
                      student={seat}
                      onDragStart={() => handleDragStart(seatIndex)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(seatIndex)}
                      layout={layout}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ROSTER (simple students editor, URLs hidden as requested earlier) */}
        <section className="bg-white rounded-2xl shadow border p-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">{state.titles[active]} — Students</h2>
            <button onClick={() => addStudent(active)} className="px-3 py-1.5 rounded-xl border">
              Add Student
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2">#</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.periods[active].length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-gray-500">
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
                        onChange={(e) => updateStudent(active, i, { name: e.target.value })}
                        className="w-full border px-2 py-1"
                      />
                    </td>
                    <td className="p-2">
                      <button onClick={() => removeStudent(active, i)} className="px-2 py-1 border">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Quick Paste (unchanged) */}
          <div className="mt-4 bg-white rounded-xl border p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Quick Paste Roster</h3>
              <button
                onClick={() => applyPaste(active)}
                className="px-3 py-1.5 rounded-xl bg-black text-white"
              >
                Apply
              </button>
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={4}
              className="w-full border px-2 py-2 font-mono text-xs"
            />
          </div>
        </section>
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

/* ---------- Desk card ---------- */
function DeskCard({
  student,
  onDragStart,
  onDragOver,
  onDrop,
  layout,
}: {
  student: Student | null;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  layout: {
    cardWidth: number;
    cardMinHeight: number;
    cardPadding: number;
    photoWidth: number;
    photoHeight: number;
    photoTopMargin: number;
  };
}) {
  return (
    <div
      className="rounded-2xl border shadow-sm bg-white flex flex-col items-center justify-start"
      style={{
        width: `${layout.cardWidth}px`,
        minHeight: `${layout.cardMinHeight}px`,
        padding: `${layout.cardPadding}px`,
      }}
      draggable={!!student}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={student?.name || ""}
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
          <img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
        ) : (
          <div className="text-xs text-gray-400">No Photo</div>
        )}
      </div>

      <div className="mt-1 w-full px-1 text-center leading-tight text-xs break-words">
        {student?.name || "(empty)"}
      </div>
    </div>
  );
}
