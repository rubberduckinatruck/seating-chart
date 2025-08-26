// --- Start of Chunk 1 -------------------------------------------------------------
import React, { useMemo, useState, useEffect } from "react";
import { toPng } from "html-to-image";

/**
 * Multi-Period Seating Chart (Names + Photos)
 * -------------------------------------------
 * • 6 rows × 3 paired columns (6×6 desks) with spacer columns
 * • Each period has its own page (tab)
 * • Randomize or Sort A→Z seating
 * • Manual drag-and-drop swap
 * • Shows Name + Photo on each desk
 * • Persistent in localStorage (state + assignments + layout)
 * • Import/Export JSON + Download PNG
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
// --- End of Chunk 1 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 2 -------------------------------------------------------------
// App state shapes & rule types, plus EMPTY_STATE and ensureRulesShape

const LS_KEY = "sb_multi_period_seating_v1"; // app state (periods/titles/rules)

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
/* --------------------------------- */

interface AppState {
  periods: Record<PeriodKey, Roster>;
  titles: Record<PeriodKey, string>;
  rules: Record<PeriodKey, PeriodRules>;
}

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
};

// Ensure loaded state has a rules object (for older saves)
function ensureRulesShape(s: AppState | null): AppState {
  if (!s) return EMPTY_STATE;
  const base = { ...s };
  if (!base.rules) {
    base.rules = {
      p1: { apart: [], together: [] },
      p3: { apart: [], together: [] },
      p4: { apart: [], together: [] },
      p5: { apart: [], together: [] },
      p6: { apart: [], together: [] },
    };
  } else {
    for (const k of PERIOD_KEYS) {
      if (!base.rules[k]) base.rules[k] = { apart: [], together: [] };
      base.rules[k].apart ||= [];
      base.rules[k].together ||= [];
    }
  }
  return base;
}
// --- End of Chunk 2 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 3 -------------------------------------------------------------
// Utility helpers (non-UI): shuffle, padToSeats, assignments storage, rule math, reconcile

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

/* ---------- Assignments persistence (per-device) ---------- */
const ASSIGN_LS_KEY = "sb_multi_period_assignments_v1";
function loadAssignments(): Record<PeriodKey, (Student | null)[]> | null {
  try {
    const raw = localStorage.getItem(ASSIGN_LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveAssignments(assignments: Record<PeriodKey, (Student | null)[]>) {
  try {
    localStorage.setItem(ASSIGN_LS_KEY, JSON.stringify(assignments));
  } catch {}
}
/* --------------------------------------------------------- */

/* ---------- Rule math helpers ---------- */
// Convert seat index -> (row, col)
function indexToRowCol(idx: number) {
  const row = Math.floor(idx / COLS);
  const col = idx % COLS;
  return { row, col };
}
// Pair key: same row, columns 0–1, 2–3, 4–5 are pairs
function pairKeyForIndex(idx: number) {
  const { row, col } = indexToRowCol(idx);
  const pair = Math.floor(col / 2);
  return `${row}-${pair}`;
}
function findSeatIndexById(arr: (Student | null)[], id: string): number {
  return arr.findIndex((s) => s && s.id === id);
}
// Count rule conflicts for a given assignment
function countConflicts(arr: (Student | null)[], rules: PeriodRules): number {
  let conflicts = 0;
  // Apart: the two students must NOT share the same pair
  for (const r of rules.apart) {
    if (!r.aId || !r.bId) continue;
    const ai = findSeatIndexById(arr, r.aId);
    const bi = findSeatIndexById(arr, r.bId);
    if (ai < 0 || bi < 0) continue; // one not seated; ignore
    if (pairKeyForIndex(ai) === pairKeyForIndex(bi)) conflicts++;
  }
  // Together: the two students MUST share the same pair
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
/* -------------------------------------- */

/* ---------- Reconcile assignments with a new/edited roster ----------
   Keeps students in their current seats when you rename or edit the roster.
   - Preserves seated students by id
   - Fills empty seats with new students not yet placed
   - Seats array length stays ROWS*COLS
--------------------------------------------------------------------- */
function reconcileAssignmentsWithRoster(
  prevSeats: (Student | null)[],
  newRoster: Roster
): (Student | null)[] {
  const seatCount = ROWS * COLS;
  const nextSeats: (Student | null)[] = new Array(seatCount).fill(null);

  const byId = new Map(newRoster.map((s) => [s.id, s]));
  const placed = new Set<string>();

  // keep existing placements where possible
  for (let i = 0; i < prevSeats.length && i < seatCount; i++) {
    const cur = prevSeats[i];
    if (cur && byId.has(cur.id)) {
      const updated = byId.get(cur.id)!; // reflect updated name/photo
      nextSeats[i] = updated;
      placed.add(updated.id);
    }
  }

  // fill remaining seats with unplaced students
  for (const s of newRoster) {
    if (placed.has(s.id)) continue;
    const idx = nextSeats.findIndex((x) => x === null);
    if (idx === -1) break;
    nextSeats[idx] = s;
    placed.add(s.id);
  }

  // pad in case fewer students than seats
  while (nextSeats.length < seatCount) nextSeats.push(null);

  return nextSeats.slice(0, seatCount);
}
// --- End of Chunk 3 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 4 -------------------------------------------------------------
// Photo manifest + path helpers (lowercase-only folders + base-aware)

function stemToDisplay(stem: string) {
  return stem.replace(/_/g, " ");
}

// Use Vite's base so paths work on GitHub Pages (/seating-chart/)
const BASE = (import.meta as any).env?.BASE_URL || "/";

// join helper that respects BASE and avoids double slashes
function joinBase(...parts: string[]) {
  const b = BASE.endsWith("/") ? BASE : BASE + "/";
  return b + parts.map((p) => p.replace(/^\/+|\/+$/g, "")).join("/");
}

async function loadPeriodFromManifest(period: "p1" | "p3" | "p4" | "p5" | "p6") {
  // lowercase folders only (p1, p3, ...)
  const folder = period.toLowerCase();
  const manifestUrl = joinBase("photos", folder, "index.json");

  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`${period} manifest not found`);

  const files: string[] = await res.json(); // e.g., ["John_Smith.png", ...]
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
// --- End of Chunk 4 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 5 -------------------------------------------------------------
// Layout settings (user-tweakable, persisted)

type LayoutSettings = {
  withinPairGap: number;   // gap between seats in a pair (columnGap)
  pairGap: number;         // spacer column width between the 3 pairs
  rowGap: number;          // gap between rows
  cardWidth: number;       // width of each desk card
  cardMinHeight: number;   // min height of desk card (for name + photo)
  cardPadding: number;     // padding inside card
  photoWidth: number;      // photo box width
  photoHeight: number;     // photo box height
  photoTopMargin: number;  // small gap above photo inside card
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
  photoHeight: 112,
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
// --- End of Chunk 5 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 6 -------------------------------------------------------------
// <App> component: state & handlers (logic only; JSX comes later)

export default function App() {
  const [state, setState] = useState<AppState>(() =>
    ensureRulesShape(loadState() ?? EMPTY_STATE)
  );
  const [active, setActive] = useState<PeriodKey>("p1");

  // assignments: load from localStorage if present, else derive from current rosters
  const [assignments, setAssignments] = useState<
    Record<PeriodKey, (Student | null)[]>
  >(() => {
    const stored = loadAssignments();
    if (stored) {
      // ensure shape & length
      const out: Record<PeriodKey, (Student | null)[]> = {} as any;
      for (const k of PERIOD_KEYS) {
        const arr = stored[k] ?? [];
        out[k] = padToSeats(arr.filter(Boolean) as Student[]);
      }
      return out;
    }
    const out: Record<PeriodKey, (Student | null)[]> = {} as any;
    for (const k of PERIOD_KEYS) out[k] = padToSeats(ensureRulesShape(loadState() ?? EMPTY_STATE).periods[k]);
    return out;
  });

  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);

  // right side panel state
  const [rosterCollapsed, setRosterCollapsed] = useState(true);
  const [rightTab, setRightTab] = useState<"students" | "rules">("students");

  // layout settings state
  const [layout, setLayout] = useState<LayoutSettings>(() => loadLayout());
  const [layoutOpen, setLayoutOpen] = useState(false);

  // persist app state + assignments + layout
  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => { saveAssignments(assignments); }, [assignments]);
  useEffect(() => {
    try { localStorage.setItem(LAYOUT_LS_KEY, JSON.stringify(layout)); } catch {}
  }, [layout]);

  // ---- Editing ----
  function addStudent(period: PeriodKey) {
    const id = `student_${Date.now()}`;
    const roster = [...state.periods[period], { id, name: "First Last", photo: "" }];
    updatePeriod(period, roster);
  }

  function updateStudent(period: PeriodKey, idx: number, patch: Partial<Student>) {
    const roster = state.periods[period].slice();
    roster[idx] = { ...roster[idx], ...patch };
    updatePeriod(period, roster);
  }

  function removeStudent(period: PeriodKey, idx: number) {
    const roster = state.periods[period].slice();
    roster.splice(idx, 1);
    updatePeriod(period, roster);
  }

  function updatePeriod(period: PeriodKey, roster: Roster) {
    setState((s) => ({ ...s, periods: { ...s.periods, [period]: roster } }));
    // reconcile seats so editing roster doesn't reseat everyone
    setAssignments((a) => ({
      ...a,
      [period]: reconcileAssignmentsWithRoster(a[period], roster),
    }));
  }

  // ---- Actions ----
  function randomize(period: PeriodKey) {
    // explicit seating randomize (does not alter roster order)
    const onlyStudents = (assignments[period].filter(Boolean) as Student[]).slice();
    const shuffled = shuffle(onlyStudents);
    const padded = padToSeats(shuffled);
    setAssignments((a) => ({ ...a, [period]: padded }));
  }

  function sortAlpha(period: PeriodKey) {
    // sort *seating* A→Z (not the roster order)
    const onlyStudents = (assignments[period].filter(Boolean) as Student[]).slice();
    onlyStudents.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const padded = padToSeats(onlyStudents);
    setAssignments((a) => ({ ...a, [period]: padded }));
  }

  function handleDragStart(idx: number) { setDragFromIdx(idx); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
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

  // ---- Import / Export ----
  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
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
          setState(normalized);
          // reconcile each period's assignments against imported rosters
          setAssignments((prev) => {
            const next: Record<PeriodKey, (Student | null)[]> = {} as any;
            for (const k of PERIOD_KEYS) {
              const prevSeats = prev[k] ?? [];
              next[k] = reconcileAssignmentsWithRoster(prevSeats, normalized.periods[k]);
            }
            return next;
          });
        }
      } catch {
        alert("Invalid JSON");
      }
    };
    reader.readAsText(f);
  }

  // ---- Paste Wizard ----
  const [pasteText, setPasteText] = useState("");
  function applyPaste(period: PeriodKey) {
    const rows = pasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const roster: Roster = rows.map((line, i) => {
      const [name, photo = ""] = line.split(/,\s*/);
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `s_${i}`;
      return { id, name, photo };
    });
    updatePeriod(period, roster);
    setPasteText("");
  }

  /* ---- Load Rosters From Photo Manifests ---- */
  async function loadRostersFromPhotos() {
    try {
      const [p1, p3, p4, p5, p6] = await Promise.all([
        loadPeriodFromManifest("p1"),
        loadPeriodFromManifest("p3"),
        loadPeriodFromManifest("p4"),
        loadPeriodFromManifest("p5"),
        loadPeriodFromManifest("p6"),
      ]);
      setState((s) => ({ ...s, periods: { p1, p3, p4, p5, p6 } }));
      setAssignments({
        p1: padToSeats(p1),
        p3: padToSeats(p3),
        p4: padToSeats(p4),
        p5: padToSeats(p5),
        p6: padToSeats(p6),
      });
      alert("Rosters loaded from photo manifests.");
    } catch (e: any) {
      alert(e?.message || "Could not load one or more manifests.");
    }
  }

  // rules helpers
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
    const next = r.apart.slice(); next.splice(idx, 1);
    setRules(period, { ...r, apart: next });
  }
  function removeTogether(period: PeriodKey, idx: number) {
    const r = rulesFor(period);
    const next = r.together.slice(); next.splice(idx, 1);
    setRules(period, { ...r, together: next });
  }

  // Explicit "Randomize" lives on the toolbar (not in rules panel)
  function randomizeWithRules(period: PeriodKey) {
    // try many shuffles; pick one that satisfies all rules (or closest)
    const roster = (assignments[period].filter(Boolean) as Student[]).slice();
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
      if (conf < bestConf) { bestConf = conf; best = arr; }
    }
    setAssignments((a) => ({ ...a, [period]: best }));
    if (bestConf > 0) {
      alert(`${bestConf} rule conflict(s) could not be satisfied; showing closest arrangement.`);
    }
  }

  // Panel toggle
  function togglePanel(tab: "students" | "rules") {
    if (rosterCollapsed) {
      setRightTab(tab);
      setRosterCollapsed(false);
    } else {
      if (rightTab === tab) setRosterCollapsed(true);
      else setRightTab(tab);
    }
  }

  // Layout helpers
  function resetLayout() { setLayout(DEFAULT_LAYOUT); }

  // Build the grid template from settings:
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

  // check conflicts button handler (uses current rules & seats)
  function checkConflictsNow() {
    const arr = assignments[active];
    const rules = rulesFor(active);
    const c = countConflicts(arr, rules);
    alert(c === 0 ? "No rule conflicts on current seating." : `${c} rule conflict(s) found on current seating.`);
  }

  // "Save Rules" — rules already persist as you edit; this is just a confirmation affordance
  function saveRulesNow() {
    alert("Rules saved.");
  }

  // JSX continues in later chunks...
// --- End of Chunk 6 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 7 -------------------------------------------------------------
// <App> component: header & period tabs JSX

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">Seating Chart</span>
            <span className="text-sm text-gray-500">(6×6 desks · pairs with spacers)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportJSON}
              className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50"
            >
              Export JSON
            </button>
            <label className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50 cursor-pointer">
              Import JSON
              <input type="file" accept="application/json" onChange={importJSON} className="hidden" />
            </label>
            <button
              onClick={loadRostersFromPhotos}
              className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50"
            >
              Load Rosters From Photos
            </button>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-4 pb-3 flex gap-2">
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
// --- End of Chunk 7 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 8 -------------------------------------------------------------
// <App> component: seating toolbar + layout panel JSX

      <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Seating — expands to full width when roster is collapsed */}
        <section className={rosterCollapsed ? "lg:col-span-12" : "lg:col-span-7"}>
          {/* ONE unified toolbar row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-xl font-semibold">{state.titles[active]} — Seating</h2>

            <div className="flex items-center gap-3">
              {/* Seating actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => randomizeWithRules(active)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white"
                >
                  Randomize
                </button>
                <button
                  onClick={() => sortAlpha(active)}
                  className="px-3 py-1.5 rounded-xl border"
                >
                  Sort A→Z
                </button>
                <button onClick={downloadPNG} className="px-3 py-1.5 rounded-xl border">
                  Download PNG
                </button>
                <button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl border">
                  Print
                </button>
              </div>

              {/* Students / Rules buttons */}
              <div className="inline-flex rounded-xl overflow-hidden border">
                <button
                  className={
                    "px-3 py-1.5 text-sm " +
                    (!rosterCollapsed && rightTab === "students" ? "bg-black text-white" : "bg-white")
                  }
                  onClick={() => togglePanel("students")}
                >
                  Students
                </button>
                <button
                  className={
                    "px-3 py-1.5 text-sm " +
                    (!rosterCollapsed && rightTab === "rules" ? "bg-black text-white" : "bg-white")
                  }
                  onClick={() => togglePanel("rules")}
                >
                  Rules
                </button>
              </div>

              {/* Layout settings toggle */}
              <button
                onClick={() => setLayoutOpen((v) => !v)}
                className={"px-3 py-1.5 rounded-xl border " + (layoutOpen ? "bg-black text-white" : "bg-white")}
                title="Layout settings (spacing & sizes)"
              >
                Layout
              </button>
            </div>
          </div>

          {/* Layout panel */}
          {layoutOpen && (
            <div className="mb-4 bg-white rounded-2xl shadow border p-3">
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
// --- End of Chunk 8 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 9 -------------------------------------------------------------
// <App> component: seating chart JSX (centered) with “Front of classroom” label

          <div id="chartCapture" className="bg-white rounded-2xl shadow p-4 border">
            <div className="text-center text-xs text-gray-500 mb-2">Front of classroom</div>
            <div
              className="grid"
              style={{
                gridTemplateColumns,              // 2 seats, spacer, 2 seats, spacer, 2 seats
                columnGap: `${layout.withinPairGap}px`,
                rowGap: `${layout.rowGap}px`,
                justifyContent: "center",        // center the whole grid inside the card
              }}
            >
              {Array.from({ length: ROWS }).map((_, r) => (
                <React.Fragment key={r}>
                  {Array.from({ length: 8 }).map((__, vcol) => {
                    // spacer columns are at 2 and 5
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
        </section>
// --- End of Chunk 9 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 10 ------------------------------------------------------------
// <App> component: right-side panel — Students view (Photo URL hidden)

        {/* Right panel — only renders when expanded. No header; the top row handles that. */}
        {!rosterCollapsed && (
          <section className="lg:col-span-5">
            {rightTab === "students" ? (
              <>
                <div className="bg-white rounded-2xl shadow border overflow-hidden">
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

                <div className="mt-4 bg-white rounded-2xl shadow border p-3">
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
                    rows={6}
                    className="w-full border px-2 py-2 font-mono text-xs"
                    placeholder="First Last, optional-photo-url.png"
                  />
                </div>
              </>
            ) : (
// --- End of Chunk 10 --------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 11 ------------------------------------------------------------
// <App> component: right-side panel — Rules view

              <div className="bg-white rounded-2xl shadow border p-3 space-y-6">
                {/* Keep Apart */}
                <div>
                  <h3 className="font-semibold mb-1">Keep Apart Rules</h3>
                  <p className="text-sm text-gray-500 mb-2">Keep these students out of the same two-seat pair.</p>
                  <div className="space-y-2">
                    {rulesFor(active).apart.map((r, i) => (
                      <div key={`apart-${i}`} className="flex items-center gap-2">
                        <select
                          className="border rounded-lg px-2 py-1 flex-1"
                          value={r.aId}
                          onChange={(e) => updateApart(active, i, { aId: e.target.value })}
                        >
                          <option value="">— Select —</option>
                          {state.periods[active].map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <span className="text-gray-500">and</span>
                        <select
                          className="border rounded-lg px-2 py-1 flex-1"
                          value={r.bId}
                          onChange={(e) => updateApart(active, i, { bId: e.target.value })}
                        >
                          <option value="">— Select —</option>
                          {state.periods[active].map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button className="px-2 py-1 border rounded-lg" onClick={() => removeApart(active, i)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" onClick={() => addApartRule(active)}>
                    + Keep Apart Rule
                  </button>
                </div>

                {/* Keep Together */}
                <div>
                  <h3 className="font-semibold mb-1">Keep Together Rules</h3>
                  <p className="text-sm text-gray-500 mb-2">Seat these students in the same two-seat pair.</p>
                  <div className="space-y-2">
                    {rulesFor(active).together.map((r, i) => (
                      <div key={`together-${i}`} className="flex items-center gap-2">
                        <select
                          className="border rounded-lg px-2 py-1 flex-1"
                          value={r.aId}
                          onChange={(e) => updateTogether(active, i, { aId: e.target.value })}
                        >
                          <option value="">— Select —</option>
                          {state.periods[active].map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <span className="text-gray-500">with</span>
                        <select
                          className="border rounded-lg px-2 py-1 flex-1"
                          value={r.bId}
                          onChange={(e) => updateTogether(active, i, { bId: e.target.value })}
                        >
                          <option value="">— Select —</option>
                          {state.periods[active].map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button className="px-2 py-1 border rounded-lg" onClick={() => removeTogether(active, i)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" onClick={() => addTogetherRule(active)}>
                    + Keep Together Rule
                  </button>
                </div>

                <div className="pt-2 border-t flex items-center gap-2">
                  <button
                    className="mt-3 px-3 py-1.5 rounded-xl border"
                    onClick={saveRulesNow}
                    title="Save the rules without changing seating"
                  >
                    Save Rules
                  </button>
                  <button
                    className="mt-3 px-3 py-1.5 rounded-xl border"
                    onClick={checkConflictsNow}
                    title="Check current seating against the rules"
                  >
                    Check Conflicts
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      {/* ---------- END MAIN ---------- */}
    </div>
  );
}
// --- End of Chunk 11 --------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 12 ------------------------------------------------------------
// Utility components: NumberField, clampInt, DeskCard

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
          <img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
        ) : (
          <div className="text-xs text-gray-400">No Photo</div>
        )}
      </div>

      {/* Name under the image */}
      <div className="mt-1 w-full px-1 text-center leading-tight text-xs break-words">
        {student?.name || "(empty)"}
      </div>
    </div>
  );
}
// --- End of Chunk 12 --------------------------------------------------------------






Sources
You said:
i need all of the chunks together in one big ready to copy/paste full and updated code. no brevity or removing or shortening anything.


ChatGPT said:

Thought for 19s
here you go — the whole src/App.tsx in one big block, complete and ready to paste (no shortening):

tsx
Copy
Edit
// --- Start of Chunk 1 -------------------------------------------------------------
import React, { useMemo, useState, useEffect } from "react";
import { toPng } from "html-to-image";

/**
 * Multi-Period Seating Chart (Names + Photos)
 * -------------------------------------------
 * • 6 rows × 3 paired columns (6×6 desks) with spacer columns
 * • Each period has its own page (tab)
 * • Randomize or Sort A→Z seating
 * • Manual drag-and-drop swap
 * • Shows Name + Photo on each desk
 * • Persistent in localStorage (state + assignments + layout)
 * • Import/Export JSON + Download PNG
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
// --- End of Chunk 1 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 2 -------------------------------------------------------------
// App state shapes & rule types, plus EMPTY_STATE and ensureRulesShape

const LS_KEY = "sb_multi_period_seating_v1"; // app state (periods/titles/rules)

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
/* --------------------------------- */

interface AppState {
  periods: Record<PeriodKey, Roster>;
  titles: Record<PeriodKey, string>;
  rules: Record<PeriodKey, PeriodRules>;
}

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
};

// Ensure loaded state has a rules object (for older saves)
function ensureRulesShape(s: AppState | null): AppState {
  if (!s) return EMPTY_STATE;
  const base = { ...s };
  if (!base.rules) {
    base.rules = {
      p1: { apart: [], together: [] },
      p3: { apart: [], together: [] },
      p4: { apart: [], together: [] },
      p5: { apart: [], together: [] },
      p6: { apart: [], together: [] },
    };
  } else {
    for (const k of PERIOD_KEYS) {
      if (!base.rules[k]) base.rules[k] = { apart: [], together: [] };
      base.rules[k].apart ||= [];
      base.rules[k].together ||= [];
    }
  }
  return base;
}
// --- End of Chunk 2 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 3 -------------------------------------------------------------
// Utility helpers (non-UI): shuffle, padToSeats, assignments storage, rule math, reconcile

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

/* ---------- Assignments persistence (per-device) ---------- */
const ASSIGN_LS_KEY = "sb_multi_period_assignments_v1";
function loadAssignments(): Record<PeriodKey, (Student | null)[]> | null {
  try {
    const raw = localStorage.getItem(ASSIGN_LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveAssignments(assignments: Record<PeriodKey, (Student | null)[]>) {
  try {
    localStorage.setItem(ASSIGN_LS_KEY, JSON.stringify(assignments));
  } catch {}
}
/* --------------------------------------------------------- */

/* ---------- Rule math helpers ---------- */
// Convert seat index -> (row, col)
function indexToRowCol(idx: number) {
  const row = Math.floor(idx / COLS);
  const col = idx % COLS;
  return { row, col };
}
// Pair key: same row, columns 0–1, 2–3, 4–5 are pairs
function pairKeyForIndex(idx: number) {
  const { row, col } = indexToRowCol(idx);
  const pair = Math.floor(col / 2);
  return `${row}-${pair}`;
}
function findSeatIndexById(arr: (Student | null)[], id: string): number {
  return arr.findIndex((s) => s && s.id === id);
}
// Count rule conflicts for a given assignment
function countConflicts(arr: (Student | null)[], rules: PeriodRules): number {
  let conflicts = 0;
  // Apart: the two students must NOT share the same pair
  for (const r of rules.apart) {
    if (!r.aId || !r.bId) continue;
    const ai = findSeatIndexById(arr, r.aId);
    const bi = findSeatIndexById(arr, r.bId);
    if (ai < 0 || bi < 0) continue; // one not seated; ignore
    if (pairKeyForIndex(ai) === pairKeyForIndex(bi)) conflicts++;
  }
  // Together: the two students MUST share the same pair
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
/* -------------------------------------- */

/* ---------- Reconcile assignments with a new/edited roster ----------
   Keeps students in their current seats when you rename or edit the roster.
   - Preserves seated students by id
   - Fills empty seats with new students not yet placed
   - Seats array length stays ROWS*COLS
--------------------------------------------------------------------- */
function reconcileAssignmentsWithRoster(
  prevSeats: (Student | null)[],
  newRoster: Roster
): (Student | null)[] {
  const seatCount = ROWS * COLS;
  const nextSeats: (Student | null)[] = new Array(seatCount).fill(null);

  const byId = new Map(newRoster.map((s) => [s.id, s]));
  const placed = new Set<string>();

  // keep existing placements where possible
  for (let i = 0; i < prevSeats.length && i < seatCount; i++) {
    const cur = prevSeats[i];
    if (cur && byId.has(cur.id)) {
      const updated = byId.get(cur.id)!; // reflect updated name/photo
      nextSeats[i] = updated;
      placed.add(updated.id);
    }
  }

  // fill remaining seats with unplaced students
  for (const s of newRoster) {
    if (placed.has(s.id)) continue;
    const idx = nextSeats.findIndex((x) => x === null);
    if (idx === -1) break;
    nextSeats[idx] = s;
    placed.add(s.id);
  }

  // pad in case fewer students than seats
  while (nextSeats.length < seatCount) nextSeats.push(null);

  return nextSeats.slice(0, seatCount);
}
// --- End of Chunk 3 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 4 -------------------------------------------------------------
// Photo manifest + path helpers (lowercase-only folders + base-aware)

function stemToDisplay(stem: string) {
  return stem.replace(/_/g, " ");
}

// Use Vite's base so paths work on GitHub Pages (/seating-chart/)
const BASE = (import.meta as any).env?.BASE_URL || "/";

// join helper that respects BASE and avoids double slashes
function joinBase(...parts: string[]) {
  const b = BASE.endsWith("/") ? BASE : BASE + "/";
  return b + parts.map((p) => p.replace(/^\/+|\/+$/g, "")).join("/");
}

async function loadPeriodFromManifest(period: "p1" | "p3" | "p4" | "p5" | "p6") {
  // lowercase folders only (p1, p3, ...)
  const folder = period.toLowerCase();
  const manifestUrl = joinBase("photos", folder, "index.json");

  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`${period} manifest not found`);

  const files: string[] = await res.json(); // e.g., ["John_Smith.png", ...]
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
// --- End of Chunk 4 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 5 -------------------------------------------------------------
// Layout settings (user-tweakable, persisted)

type LayoutSettings = {
  withinPairGap: number;   // gap between seats in a pair (columnGap)
  pairGap: number;         // spacer column width between the 3 pairs
  rowGap: number;          // gap between rows
  cardWidth: number;       // width of each desk card
  cardMinHeight: number;   // min height of desk card (for name + photo)
  cardPadding: number;     // padding inside card
  photoWidth: number;      // photo box width
  photoHeight: number;     // photo box height
  photoTopMargin: number;  // small gap above photo inside card
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
  photoHeight: 112,
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
// --- End of Chunk 5 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 6 -------------------------------------------------------------
// <App> component: state & handlers (logic only; JSX comes later)

export default function App() {
  const [state, setState] = useState<AppState>(() =>
    ensureRulesShape(loadState() ?? EMPTY_STATE)
  );
  const [active, setActive] = useState<PeriodKey>("p1");

  // assignments: load from localStorage if present, else derive from current rosters
  const [assignments, setAssignments] = useState<
    Record<PeriodKey, (Student | null)[]>
  >(() => {
    const stored = loadAssignments();
    if (stored) {
      // ensure shape & length
      const out: Record<PeriodKey, (Student | null)[]> = {} as any;
      for (const k of PERIOD_KEYS) {
        const arr = stored[k] ?? [];
        out[k] = padToSeats(arr.filter(Boolean) as Student[]);
      }
      return out;
    }
    const out: Record<PeriodKey, (Student | null)[]> = {} as any;
    for (const k of PERIOD_KEYS) out[k] = padToSeats(ensureRulesShape(loadState() ?? EMPTY_STATE).periods[k]);
    return out;
  });

  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);

  // right side panel state
  const [rosterCollapsed, setRosterCollapsed] = useState(true);
  const [rightTab, setRightTab] = useState<"students" | "rules">("students");

  // layout settings state
  const [layout, setLayout] = useState<LayoutSettings>(() => loadLayout());
  const [layoutOpen, setLayoutOpen] = useState(false);

  // persist app state + assignments + layout
  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => { saveAssignments(assignments); }, [assignments]);
  useEffect(() => {
    try { localStorage.setItem(LAYOUT_LS_KEY, JSON.stringify(layout)); } catch {}
  }, [layout]);

  // ---- Editing ----
  function addStudent(period: PeriodKey) {
    const id = `student_${Date.now()}`;
    const roster = [...state.periods[period], { id, name: "First Last", photo: "" }];
    updatePeriod(period, roster);
  }

  function updateStudent(period: PeriodKey, idx: number, patch: Partial<Student>) {
    const roster = state.periods[period].slice();
    roster[idx] = { ...roster[idx], ...patch };
    updatePeriod(period, roster);
  }

  function removeStudent(period: PeriodKey, idx: number) {
    const roster = state.periods[period].slice();
    roster.splice(idx, 1);
    updatePeriod(period, roster);
  }

  function updatePeriod(period: PeriodKey, roster: Roster) {
    setState((s) => ({ ...s, periods: { ...s.periods, [period]: roster } }));
    // reconcile seats so editing roster doesn't reseat everyone
    setAssignments((a) => ({
      ...a,
      [period]: reconcileAssignmentsWithRoster(a[period], roster),
    }));
  }

  // ---- Actions ----
  function randomize(period: PeriodKey) {
    // explicit seating randomize (does not alter roster order)
    const onlyStudents = (assignments[period].filter(Boolean) as Student[]).slice();
    const shuffled = shuffle(onlyStudents);
    const padded = padToSeats(shuffled);
    setAssignments((a) => ({ ...a, [period]: padded }));
  }

  function sortAlpha(period: PeriodKey) {
    // sort *seating* A→Z (not the roster order)
    const onlyStudents = (assignments[period].filter(Boolean) as Student[]).slice();
    onlyStudents.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const padded = padToSeats(onlyStudents);
    setAssignments((a) => ({ ...a, [period]: padded }));
  }

  function handleDragStart(idx: number) { setDragFromIdx(idx); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
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

  // ---- Import / Export ----
  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
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
          setState(normalized);
          // reconcile each period's assignments against imported rosters
          setAssignments((prev) => {
            const next: Record<PeriodKey, (Student | null)[]> = {} as any;
            for (const k of PERIOD_KEYS) {
              const prevSeats = prev[k] ?? [];
              next[k] = reconcileAssignmentsWithRoster(prevSeats, normalized.periods[k]);
            }
            return next;
          });
        }
      } catch {
        alert("Invalid JSON");
      }
    };
    reader.readAsText(f);
  }

  // ---- Paste Wizard ----
  const [pasteText, setPasteText] = useState("");
  function applyPaste(period: PeriodKey) {
    const rows = pasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const roster: Roster = rows.map((line, i) => {
      const [name, photo = ""] = line.split(/,\s*/);
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `s_${i}`;
      return { id, name, photo };
    });
    updatePeriod(period, roster);
    setPasteText("");
  }

  /* ---- Load Rosters From Photo Manifests ---- */
  async function loadRostersFromPhotos() {
    try {
      const [p1, p3, p4, p5, p6] = await Promise.all([
        loadPeriodFromManifest("p1"),
        loadPeriodFromManifest("p3"),
        loadPeriodFromManifest("p4"),
        loadPeriodFromManifest("p5"),
        loadPeriodFromManifest("p6"),
      ]);
      setState((s) => ({ ...s, periods: { p1, p3, p4, p5, p6 } }));
      setAssignments({
        p1: padToSeats(p1),
        p3: padToSeats(p3),
        p4: padToSeats(p4),
        p5: padToSeats(p5),
        p6: padToSeats(p6),
      });
      alert("Rosters loaded from photo manifests.");
    } catch (e: any) {
      alert(e?.message || "Could not load one or more manifests.");
    }
  }

  // rules helpers
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
    const next = r.apart.slice(); next.splice(idx, 1);
    setRules(period, { ...r, apart: next });
  }
  function removeTogether(period: PeriodKey, idx: number) {
    const r = rulesFor(period);
    const next = r.together.slice(); next.splice(idx, 1);
    setRules(period, { ...r, together: next });
  }

  // Explicit "Randomize" lives on the toolbar (not in rules panel)
  function randomizeWithRules(period: PeriodKey) {
    // try many shuffles; pick one that satisfies all rules (or closest)
    const roster = (assignments[period].filter(Boolean) as Student[]).slice();
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
      if (conf < bestConf) { bestConf = conf; best = arr; }
    }
    setAssignments((a) => ({ ...a, [period]: best }));
    if (bestConf > 0) {
      alert(`${bestConf} rule conflict(s) could not be satisfied; showing closest arrangement.`);
    }
  }

  // Panel toggle
  function togglePanel(tab: "students" | "rules") {
    if (rosterCollapsed) {
      setRightTab(tab);
      setRosterCollapsed(false);
    } else {
      if (rightTab === tab) setRosterCollapsed(true);
      else setRightTab(tab);
    }
  }

  // Layout helpers
  function resetLayout() { setLayout(DEFAULT_LAYOUT); }

  // Build the grid template from settings:
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

  // check conflicts button handler (uses current rules & seats)
  function checkConflictsNow() {
    const arr = assignments[active];
    const rules = rulesFor(active);
    const c = countConflicts(arr, rules);
    alert(c === 0 ? "No rule conflicts on current seating." : `${c} rule conflict(s) found on current seating.`);
  }

  // "Save Rules" — rules already persist as you edit; this is just a confirmation affordance
  function saveRulesNow() {
    alert("Rules saved.");
  }

  // JSX continues in later chunks...
// --- End of Chunk 6 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 7 -------------------------------------------------------------
// <App> component: header & period tabs JSX

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">Seating Chart</span>
            <span className="text-sm text-gray-500">(6×6 desks · pairs with spacers)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportJSON}
              className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50"
            >
              Export JSON
            </button>
            <label className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50 cursor-pointer">
              Import JSON
              <input type="file" accept="application/json" onChange={importJSON} className="hidden" />
            </label>
            <button
              onClick={loadRostersFromPhotos}
              className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50"
            >
              Load Rosters From Photos
            </button>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-4 pb-3 flex gap-2">
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
// --- End of Chunk 7 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 8 -------------------------------------------------------------
// <App> component: seating toolbar + layout panel JSX

      <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Seating — expands to full width when roster is collapsed */}
        <section className={rosterCollapsed ? "lg:col-span-12" : "lg:col-span-7"}>
          {/* ONE unified toolbar row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-xl font-semibold">{state.titles[active]} — Seating</h2>

            <div className="flex items-center gap-3">
              {/* Seating actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => randomizeWithRules(active)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white"
                >
                  Randomize
                </button>
                <button
                  onClick={() => sortAlpha(active)}
                  className="px-3 py-1.5 rounded-xl border"
                >
                  Sort A→Z
                </button>
                <button onClick={downloadPNG} className="px-3 py-1.5 rounded-xl border">
                  Download PNG
                </button>
                <button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl border">
                  Print
                </button>
              </div>

              {/* Students / Rules buttons */}
              <div className="inline-flex rounded-xl overflow-hidden border">
                <button
                  className={
                    "px-3 py-1.5 text-sm " +
                    (!rosterCollapsed && rightTab === "students" ? "bg-black text-white" : "bg-white")
                  }
                  onClick={() => togglePanel("students")}
                >
                  Students
                </button>
                <button
                  className={
                    "px-3 py-1.5 text-sm " +
                    (!rosterCollapsed && rightTab === "rules" ? "bg-black text-white" : "bg-white")
                  }
                  onClick={() => togglePanel("rules")}
                >
                  Rules
                </button>
              </div>

              {/* Layout settings toggle */}
              <button
                onClick={() => setLayoutOpen((v) => !v)}
                className={"px-3 py-1.5 rounded-xl border " + (layoutOpen ? "bg-black text-white" : "bg-white")}
                title="Layout settings (spacing & sizes)"
              >
                Layout
              </button>
            </div>
          </div>

          {/* Layout panel */}
          {layoutOpen && (
            <div className="mb-4 bg-white rounded-2xl shadow border p-3">
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
// --- End of Chunk 8 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 9 -------------------------------------------------------------
// <App> component: seating chart JSX (centered) with “Front of classroom” label

          <div id="chartCapture" className="bg-white rounded-2xl shadow p-4 border">
            <div className="text-center text-xs text-gray-500 mb-2">Front of classroom</div>
            <div
              className="grid"
              style={{
                gridTemplateColumns,              // 2 seats, spacer, 2 seats, spacer, 2 seats
                columnGap: `${layout.withinPairGap}px`,
                rowGap: `${layout.rowGap}px`,
                justifyContent: "center",        // center the whole grid inside the card
              }}
            >
              {Array.from({ length: ROWS }).map((_, r) => (
                <React.Fragment key={r}>
                  {Array.from({ length: 8 }).map((__, vcol) => {
                    // spacer columns are at 2 and 5
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
        </section>
// --- End of Chunk 9 ---------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 10 ------------------------------------------------------------
// <App> component: right-side panel — Students view (Photo URL hidden)

        {/* Right panel — only renders when expanded. No header; the top row handles that. */}
        {!rosterCollapsed && (
          <section className="lg:col-span-5">
            {rightTab === "students" ? (
              <>
                <div className="bg-white rounded-2xl shadow border overflow-hidden">
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

                <div className="mt-4 bg-white rounded-2xl shadow border p-3">
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
                    rows={6}
                    className="w-full border px-2 py-2 font-mono text-xs"
                    placeholder="First Last, optional-photo-url.png"
                  />
                </div>
              </>
            ) : (
// --- End of Chunk 10 --------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 11 ------------------------------------------------------------
// <App> component: right-side panel — Rules view

              <div className="bg-white rounded-2xl shadow border p-3 space-y-6">
                {/* Keep Apart */}
                <div>
                  <h3 className="font-semibold mb-1">Keep Apart Rules</h3>
                  <p className="text-sm text-gray-500 mb-2">Keep these students out of the same two-seat pair.</p>
                  <div className="space-y-2">
                    {rulesFor(active).apart.map((r, i) => (
                      <div key={`apart-${i}`} className="flex items-center gap-2">
                        <select
                          className="border rounded-lg px-2 py-1 flex-1"
                          value={r.aId}
                          onChange={(e) => updateApart(active, i, { aId: e.target.value })}
                        >
                          <option value="">— Select —</option>
                          {state.periods[active].map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <span className="text-gray-500">and</span>
                        <select
                          className="border rounded-lg px-2 py-1 flex-1"
                          value={r.bId}
                          onChange={(e) => updateApart(active, i, { bId: e.target.value })}
                        >
                          <option value="">— Select —</option>
                          {state.periods[active].map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button className="px-2 py-1 border rounded-lg" onClick={() => removeApart(active, i)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" onClick={() => addApartRule(active)}>
                    + Keep Apart Rule
                  </button>
                </div>

                {/* Keep Together */}
                <div>
                  <h3 className="font-semibold mb-1">Keep Together Rules</h3>
                  <p className="text-sm text-gray-500 mb-2">Seat these students in the same two-seat pair.</p>
                  <div className="space-y-2">
                    {rulesFor(active).together.map((r, i) => (
                      <div key={`together-${i}`} className="flex items-center gap-2">
                        <select
                          className="border rounded-lg px-2 py-1 flex-1"
                          value={r.aId}
                          onChange={(e) => updateTogether(active, i, { aId: e.target.value })}
                        >
                          <option value="">— Select —</option>
                          {state.periods[active].map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <span className="text-gray-500">with</span>
                        <select
                          className="border rounded-lg px-2 py-1 flex-1"
                          value={r.bId}
                          onChange={(e) => updateTogether(active, i, { bId: e.target.value })}
                        >
                          <option value="">— Select —</option>
                          {state.periods[active].map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button className="px-2 py-1 border rounded-lg" onClick={() => removeTogether(active, i)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" onClick={() => addTogetherRule(active)}>
                    + Keep Together Rule
                  </button>
                </div>

                <div className="pt-2 border-t flex items-center gap-2">
                  <button
                    className="mt-3 px-3 py-1.5 rounded-xl border"
                    onClick={saveRulesNow}
                    title="Save the rules without changing seating"
                  >
                    Save Rules
                  </button>
                  <button
                    className="mt-3 px-3 py-1.5 rounded-xl border"
                    onClick={checkConflictsNow}
                    title="Check current seating against the rules"
                  >
                    Check Conflicts
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      {/* ---------- END MAIN ---------- */}
    </div>
  );
}
// --- End of Chunk 11 --------------------------------------------------------------
tsx
Copy
Edit
// --- Start of Chunk 12 ------------------------------------------------------------
// Utility components: NumberField, clampInt, DeskCard

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
          <img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
        ) : (
          <div className="text-xs text-gray-400">No Photo</div>
        )}
      </div>

      {/* Name under the image */}
      <div className="mt-1 w-full px-1 text-center leading-tight text-xs break-words">
        {student?.name || "(empty)"}
      </div>
    </div>
  );
}
// --- End of Chunk 12 ------------------------------------------------------------






Sources
You said:
paste the entire code as plain text with all 12 chunks without any brevity.


ChatGPT said:

Thought for 19s
// --- Start of Chunk 1 -------------------------------------------------------------
import React, { useMemo, useState, useEffect } from "react";
import { toPng } from "html-to-image";

/**

Multi-Period Seating Chart (Names + Photos)

• 6 rows × 3 paired columns (6×6 desks) with spacer columns

• Each period has its own page (tab)

• Randomize or Sort A→Z seating

• Manual drag-and-drop swap

• Shows Name + Photo on each desk

• Persistent in localStorage (state + assignments + layout)

• Import/Export JSON + Download PNG
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
// --- End of Chunk 1 ---------------------------------------------------------------

// --- Start of Chunk 2 -------------------------------------------------------------
// App state shapes & rule types, plus EMPTY_STATE and ensureRulesShape

const LS_KEY = "sb_multi_period_seating_v1"; // app state (periods/titles/rules)

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

/* ---------- Rules types ---------- /
type ApartRule = { aId: string; bId: string };
type TogetherRule = { aId: string; bId: string };
type PeriodRules = { apart: ApartRule[]; together: TogetherRule[] };
/ --------------------------------- */

interface AppState {
periods: Record<PeriodKey, Roster>;
titles: Record<PeriodKey, string>;
rules: Record<PeriodKey, PeriodRules>;
}

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
};

// Ensure loaded state has a rules object (for older saves)
function ensureRulesShape(s: AppState | null): AppState {
if (!s) return EMPTY_STATE;
const base = { ...s };
if (!base.rules) {
base.rules = {
p1: { apart: [], together: [] },
p3: { apart: [], together: [] },
p4: { apart: [], together: [] },
p5: { apart: [], together: [] },
p6: { apart: [], together: [] },
};
} else {
for (const k of PERIOD_KEYS) {
if (!base.rules[k]) base.rules[k] = { apart: [], together: [] };
base.rules[k].apart ||= [];
base.rules[k].together ||= [];
}
}
return base;
}
// --- End of Chunk 2 ---------------------------------------------------------------

// --- Start of Chunk 3 -------------------------------------------------------------
// Utility helpers (non-UI): shuffle, padToSeats, assignments storage, rule math, reconcile

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

/* ---------- Assignments persistence (per-device) ---------- /
const ASSIGN_LS_KEY = "sb_multi_period_assignments_v1";
function loadAssignments(): Record<PeriodKey, (Student | null)[]> | null {
try {
const raw = localStorage.getItem(ASSIGN_LS_KEY);
if (!raw) return null;
return JSON.parse(raw);
} catch {
return null;
}
}
function saveAssignments(assignments: Record<PeriodKey, (Student | null)[]>) {
try {
localStorage.setItem(ASSIGN_LS_KEY, JSON.stringify(assignments));
} catch {}
}
/ --------------------------------------------------------- */

/* ---------- Rule math helpers ---------- /
// Convert seat index -> (row, col)
function indexToRowCol(idx: number) {
const row = Math.floor(idx / COLS);
const col = idx % COLS;
return { row, col };
}
// Pair key: same row, columns 0–1, 2–3, 4–5 are pairs
function pairKeyForIndex(idx: number) {
const { row, col } = indexToRowCol(idx);
const pair = Math.floor(col / 2);
return ${row}-${pair};
}
function findSeatIndexById(arr: (Student | null)[], id: string): number {
return arr.findIndex((s) => s && s.id === id);
}
// Count rule conflicts for a given assignment
function countConflicts(arr: (Student | null)[], rules: PeriodRules): number {
let conflicts = 0;
// Apart: the two students must NOT share the same pair
for (const r of rules.apart) {
if (!r.aId || !r.bId) continue;
const ai = findSeatIndexById(arr, r.aId);
const bi = findSeatIndexById(arr, r.bId);
if (ai < 0 || bi < 0) continue; // one not seated; ignore
if (pairKeyForIndex(ai) === pairKeyForIndex(bi)) conflicts++;
}
// Together: the two students MUST share the same pair
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
/ -------------------------------------- */

/* ---------- Reconcile assignments with a new/edited roster ----------
Keeps students in their current seats when you rename or edit the roster.

Preserves seated students by id

Fills empty seats with new students not yet placed

Seats array length stays ROWS*COLS
--------------------------------------------------------------------- */
function reconcileAssignmentsWithRoster(
prevSeats: (Student | null)[],
newRoster: Roster
): (Student | null)[] {
const seatCount = ROWS * COLS;
const nextSeats: (Student | null)[] = new Array(seatCount).fill(null);

const byId = new Map(newRoster.map((s) => [s.id, s]));
const placed = new Set<string>();

// keep existing placements where possible
for (let i = 0; i < prevSeats.length && i < seatCount; i++) {
const cur = prevSeats[i];
if (cur && byId.has(cur.id)) {
const updated = byId.get(cur.id)!; // reflect updated name/photo
nextSeats[i] = updated;
placed.add(updated.id);
}
}

// fill remaining seats with unplaced students
for (const s of newRoster) {
if (placed.has(s.id)) continue;
const idx = nextSeats.findIndex((x) => x === null);
if (idx === -1) break;
nextSeats[idx] = s;
placed.add(s.id);
}

// pad in case fewer students than seats
while (nextSeats.length < seatCount) nextSeats.push(null);

return nextSeats.slice(0, seatCount);
}
// --- End of Chunk 3 ---------------------------------------------------------------

// --- Start of Chunk 4 -------------------------------------------------------------
// Photo manifest + path helpers (lowercase-only folders + base-aware)

function stemToDisplay(stem: string) {
return stem.replace(/_/g, " ");
}

// Use Vite's base so paths work on GitHub Pages (/seating-chart/)
const BASE = (import.meta as any).env?.BASE_URL || "/";

// join helper that respects BASE and avoids double slashes
function joinBase(...parts: string[]) {
const b = BASE.endsWith("/") ? BASE : BASE + "/";
return b + parts.map((p) => p.replace(/^/+|/+$/g, "")).join("/");
}

async function loadPeriodFromManifest(period: "p1" | "p3" | "p4" | "p5" | "p6") {
// lowercase folders only (p1, p3, ...)
const folder = period.toLowerCase();
const manifestUrl = joinBase("photos", folder, "index.json");

const res = await fetch(manifestUrl, { cache: "no-store" });
if (!res.ok) throw new Error(${period} manifest not found);

const files: string[] = await res.json(); // e.g., ["John_Smith.png", ...]
const basePath = joinBase("photos", folder) + "/";

return files.map((filename) => {
const stem = filename.replace(/.[^.]+$/, "");
return {
id: stem,
name: stemToDisplay(stem),
photo: basePath + filename,
} as Student;
});
}
// --- End of Chunk 4 ---------------------------------------------------------------

// --- Start of Chunk 5 -------------------------------------------------------------
// Layout settings (user-tweakable, persisted)

type LayoutSettings = {
withinPairGap: number; // gap between seats in a pair (columnGap)
pairGap: number; // spacer column width between the 3 pairs
rowGap: number; // gap between rows
cardWidth: number; // width of each desk card
cardMinHeight: number; // min height of desk card (for name + photo)
cardPadding: number; // padding inside card
photoWidth: number; // photo box width
photoHeight: number; // photo box height
photoTopMargin: number; // small gap above photo inside card
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
photoHeight: 112,
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
// --- End of Chunk 5 ---------------------------------------------------------------

// --- Start of Chunk 6 -------------------------------------------------------------
// <App> component: state & handlers (logic only; JSX comes later)

export default function App() {
const [state, setState] = useState<AppState>(() =>
ensureRulesShape(loadState() ?? EMPTY_STATE)
);
const [active, setActive] = useState<PeriodKey>("p1");

// assignments: load from localStorage if present, else derive from current rosters
const [assignments, setAssignments] = useState<
Record<PeriodKey, (Student | null)[]>

(() => {
const stored = loadAssignments();
if (stored) {
// ensure shape & length
const out: Record<PeriodKey, (Student | null)[]> = {} as any;
for (const k of PERIOD_KEYS) {
const arr = stored[k] ?? [];
out[k] = padToSeats(arr.filter(Boolean) as Student[]);
}
return out;
}
const out: Record<PeriodKey, (Student | null)[]> = {} as any;
for (const k of PERIOD_KEYS) out[k] = padToSeats(ensureRulesShape(loadState() ?? EMPTY_STATE).periods[k]);
return out;
});

const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);

// right side panel state
const [rosterCollapsed, setRosterCollapsed] = useState(true);
const [rightTab, setRightTab] = useState<"students" | "rules">("students");

// layout settings state
const [layout, setLayout] = useState<LayoutSettings>(() => loadLayout());
const [layoutOpen, setLayoutOpen] = useState(false);

// persist app state + assignments + layout
useEffect(() => { saveState(state); }, [state]);
useEffect(() => { saveAssignments(assignments); }, [assignments]);
useEffect(() => {
try { localStorage.setItem(LAYOUT_LS_KEY, JSON.stringify(layout)); } catch {}
}, [layout]);

// ---- Editing ----
function addStudent(period: PeriodKey) {
const id = student_${Date.now()};
const roster = [...state.periods[period], { id, name: "First Last", photo: "" }];
updatePeriod(period, roster);
}

function updateStudent(period: PeriodKey, idx: number, patch: Partial<Student>) {
const roster = state.periods[period].slice();
roster[idx] = { ...roster[idx], ...patch };
updatePeriod(period, roster);
}

function removeStudent(period: PeriodKey, idx: number) {
const roster = state.periods[period].slice();
roster.splice(idx, 1);
updatePeriod(period, roster);
}

function updatePeriod(period: PeriodKey, roster: Roster) {
setState((s) => ({ ...s, periods: { ...s.periods, [period]: roster } }));
// reconcile seats so editing roster doesn't reseat everyone
setAssignments((a) => ({
...a,
[period]: reconcileAssignmentsWithRoster(a[period], roster),
}));
}

// ---- Actions ----
function randomize(period: PeriodKey) {
// explicit seating randomize (does not alter roster order)
const onlyStudents = (assignments[period].filter(Boolean) as Student[]).slice();
const shuffled = shuffle(onlyStudents);
const padded = padToSeats(shuffled);
setAssignments((a) => ({ ...a, [period]: padded }));
}

function sortAlpha(period: PeriodKey) {
// sort seating A→Z (not the roster order)
const onlyStudents = (assignments[period].filter(Boolean) as Student[]).slice();
onlyStudents.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
const padded = padToSeats(onlyStudents);
setAssignments((a) => ({ ...a, [period]: padded }));
}

function handleDragStart(idx: number) { setDragFromIdx(idx); }
function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
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
a.download = ${state.titles[active].replace(/\s+/g, "_").toLowerCase()}_seating.png;
a.click();
}

// ---- Import / Export ----
function exportJSON() {
const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
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
setState(normalized);
// reconcile each period's assignments against imported rosters
setAssignments((prev) => {
const next: Record<PeriodKey, (Student | null)[]> = {} as any;
for (const k of PERIOD_KEYS) {
const prevSeats = prev[k] ?? [];
next[k] = reconcileAssignmentsWithRoster(prevSeats, normalized.periods[k]);
}
return next;
});
}
} catch {
alert("Invalid JSON");
}
};
reader.readAsText(f);
}

// ---- Paste Wizard ----
const [pasteText, setPasteText] = useState("");
function applyPaste(period: PeriodKey) {
const rows = pasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const roster: Roster = rows.map((line, i) => {
const [name, photo = ""] = line.split(/,\s*/);
const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || s_${i};
return { id, name, photo };
});
updatePeriod(period, roster);
setPasteText("");
}

/* ---- Load Rosters From Photo Manifests ---- */
async function loadRostersFromPhotos() {
try {
const [p1, p3, p4, p5, p6] = await Promise.all([
loadPeriodFromManifest("p1"),
loadPeriodFromManifest("p3"),
loadPeriodFromManifest("p4"),
loadPeriodFromManifest("p5"),
loadPeriodFromManifest("p6"),
]);
setState((s) => ({ ...s, periods: { p1, p3, p4, p5, p6 } }));
setAssignments({
p1: padToSeats(p1),
p3: padToSeats(p3),
p4: padToSeats(p4),
p5: padToSeats(p5),
p6: padToSeats(p6),
});
alert("Rosters loaded from photo manifests.");
} catch (e: any) {
alert(e?.message || "Could not load one or more manifests.");
}
}

// rules helpers
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
const next = r.apart.slice(); next.splice(idx, 1);
setRules(period, { ...r, apart: next });
}
function removeTogether(period: PeriodKey, idx: number) {
const r = rulesFor(period);
const next = r.together.slice(); next.splice(idx, 1);
setRules(period, { ...r, together: next });
}

// Explicit "Randomize" lives on the toolbar (not in rules panel)
function randomizeWithRules(period: PeriodKey) {
// try many shuffles; pick one that satisfies all rules (or closest)
const roster = (assignments[period].filter(Boolean) as Student[]).slice();
const rules = rulesFor(period);
let best = padToSeats(roster);
let bestConf = Number.POSITIVE_INFINITY;

javascript
Copy
Edit
for (let t = 0; t < 1500; t++) {
  const arr = padToSeats(shuffle(roster));
  const conf = countConflicts(arr, rules);
  if (conf === 0) {
    setAssignments((a) => ({ ...a, [period]: arr }));
    return;
  }
  if (conf < bestConf) { bestConf = conf; best = arr; }
}
setAssignments((a) => ({ ...a, [period]: best }));
if (bestConf > 0) {
  alert(`${bestConf} rule conflict(s) could not be satisfied; showing closest arrangement.`);
}
}

// Panel toggle
function togglePanel(tab: "students" | "rules") {
if (rosterCollapsed) {
setRightTab(tab);
setRosterCollapsed(false);
} else {
if (rightTab === tab) setRosterCollapsed(true);
else setRightTab(tab);
}
}

// Layout helpers
function resetLayout() { setLayout(DEFAULT_LAYOUT); }

// Build the grid template from settings:
const seatCol = ${layout.cardWidth}px;
const gridTemplateColumns = [
seatCol,
seatCol,
${layout.pairGap}px,
seatCol,
seatCol,
${layout.pairGap}px,
seatCol,
seatCol,
].join(" ");

// check conflicts button handler (uses current rules & seats)
function checkConflictsNow() {
const arr = assignments[active];
const rules = rulesFor(active);
const c = countConflicts(arr, rules);
alert(c === 0 ? "No rule conflicts on current seating." : ${c} rule conflict(s) found on current seating.);
}

// "Save Rules" — rules already persist as you edit; this is just a confirmation affordance
function saveRulesNow() {
alert("Rules saved.");
}

// JSX continues in later chunks...
// --- End of Chunk 6 ---------------------------------------------------------------

// --- Start of Chunk 7 -------------------------------------------------------------
// <App> component: header & period tabs JSX

return (
<div className="min-h-screen bg-gray-50 text-gray-900">
<header className="sticky top-0 z-10 bg-white border-b">
<div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
<div className="flex items-center gap-3">
<span className="text-2xl font-bold">Seating Chart</span>
<span className="text-sm text-gray-500">(6×6 desks · pairs with spacers)</span>
</div>
<div className="flex items-center gap-2">
<button onClick={exportJSON} className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" >
Export JSON
</button>
<label className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50 cursor-pointer">
Import JSON
<input type="file" accept="application/json" onChange={importJSON} className="hidden" />
</label>
<button onClick={loadRostersFromPhotos} className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" >
Load Rosters From Photos
</button>
</div>
</div>
<nav className="mx-auto max-w-6xl px-4 pb-3 flex gap-2">
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
// --- End of Chunk 7 ---------------------------------------------------------------

// --- Start of Chunk 8 -------------------------------------------------------------
// <App> component: seating toolbar + layout panel JSX

javascript
Copy
Edit
  <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
    {/* Seating — expands to full width when roster is collapsed */}
    <section className={rosterCollapsed ? "lg:col-span-12" : "lg:col-span-7"}>
      {/* ONE unified toolbar row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-xl font-semibold">{state.titles[active]} — Seating</h2>

        <div className="flex items-center gap-3">
          {/* Seating actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => randomizeWithRules(active)}
              className="px-3 py-1.5 rounded-xl bg-blue-600 text-white"
            >
              Randomize
            </button>
            <button
              onClick={() => sortAlpha(active)}
              className="px-3 py-1.5 rounded-xl border"
            >
              Sort A→Z
            </button>
            <button onClick={downloadPNG} className="px-3 py-1.5 rounded-xl border">
              Download PNG
            </button>
            <button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl border">
              Print
            </button>
          </div>

          {/* Students / Rules buttons */}
          <div className="inline-flex rounded-xl overflow-hidden border">
            <button
              className={
                "px-3 py-1.5 text-sm " +
                (!rosterCollapsed && rightTab === "students" ? "bg-black text-white" : "bg-white")
              }
              onClick={() => togglePanel("students")}
            >
              Students
            </button>
            <button
              className={
                "px-3 py-1.5 text-sm " +
                (!rosterCollapsed && rightTab === "rules" ? "bg-black text-white" : "bg-white")
              }
              onClick={() => togglePanel("rules")}
            >
              Rules
            </button>
          </div>

          {/* Layout settings toggle */}
          <button
            onClick={() => setLayoutOpen((v) => !v)}
            className={"px-3 py-1.5 rounded-xl border " + (layoutOpen ? "bg-black text-white" : "bg-white")}
            title="Layout settings (spacing & sizes)"
          >
            Layout
          </button>
        </div>
      </div>

      {/* Layout panel */}
      {layoutOpen && (
        <div className="mb-4 bg-white rounded-2xl shadow border p-3">
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
// --- End of Chunk 8 ---------------------------------------------------------------

// --- Start of Chunk 9 -------------------------------------------------------------
// <App> component: seating chart JSX (centered) with “Front of classroom” label

php-template
Copy
Edit
      <div id="chartCapture" className="bg-white rounded-2xl shadow p-4 border">
        <div className="text-center text-xs text-gray-500 mb-2">Front of classroom</div>
        <div
          className="grid"
          style={{
            gridTemplateColumns,              // 2 seats, spacer, 2 seats, spacer, 2 seats
            columnGap: `${layout.withinPairGap}px`,
            rowGap: `${layout.rowGap}px`,
            justifyContent: "center",        // center the whole grid inside the card
          }}
        >
          {Array.from({ length: ROWS }).map((_, r) => (
            <React.Fragment key={r}>
              {Array.from({ length: 8 }).map((__, vcol) => {
                // spacer columns are at 2 and 5
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
    </section>
// --- End of Chunk 9 ---------------------------------------------------------------

// --- Start of Chunk 10 ------------------------------------------------------------
// <App> component: right-side panel — Students view (Photo URL hidden)

javascript
Copy
Edit
    {/* Right panel — only renders when expanded. No header; the top row handles that. */}
    {!rosterCollapsed && (
      <section className="lg:col-span-5">
        {rightTab === "students" ? (
          <>
            <div className="bg-white rounded-2xl shadow border overflow-hidden">
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

            <div className="mt-4 bg-white rounded-2xl shadow border p-3">
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
                rows={6}
                className="w-full border px-2 py-2 font-mono text-xs"
                placeholder="First Last, optional-photo-url.png"
              />
            </div>
          </>
        ) : (
// --- End of Chunk 10 --------------------------------------------------------------

// --- Start of Chunk 11 ------------------------------------------------------------
// <App> component: right-side panel — Rules view

php-template
Copy
Edit
          <div className="bg-white rounded-2xl shadow border p-3 space-y-6">
            {/* Keep Apart */}
            <div>
              <h3 className="font-semibold mb-1">Keep Apart Rules</h3>
              <p className="text-sm text-gray-500 mb-2">Keep these students out of the same two-seat pair.</p>
              <div className="space-y-2">
                {rulesFor(active).apart.map((r, i) => (
                  <div key={`apart-${i}`} className="flex items-center gap-2">
                    <select
                      className="border rounded-lg px-2 py-1 flex-1"
                      value={r.aId}
                      onChange={(e) => updateApart(active, i, { aId: e.target.value })}
                    >
                      <option value="">— Select —</option>
                      {state.periods[active].map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <span className="text-gray-500">and</span>
                    <select
                      className="border rounded-lg px-2 py-1 flex-1"
                      value={r.bId}
                      onChange={(e) => updateApart(active, i, { bId: e.target.value })}
                    >
                      <option value="">— Select —</option>
                      {state.periods[active].map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button className="px-2 py-1 border rounded-lg" onClick={() => removeApart(active, i)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" onClick={() => addApartRule(active)}>
                + Keep Apart Rule
              </button>
            </div>

            {/* Keep Together */}
            <div>
              <h3 className="font-semibold mb-1">Keep Together Rules</h3>
              <p className="text-sm text-gray-500 mb-2">Seat these students in the same two-seat pair.</p>
              <div className="space-y-2">
                {rulesFor(active).together.map((r, i) => (
                  <div key={`together-${i}`} className="flex items-center gap-2">
                    <select
                      className="border rounded-lg px-2 py-1 flex-1"
                      value={r.aId}
                      onChange={(e) => updateTogether(active, i, { aId: e.target.value })}
                    >
                      <option value="">— Select —</option>
                      {state.periods[active].map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <span className="text-gray-500">with</span>
                    <select
                      className="border rounded-lg px-2 py-1 flex-1"
                      value={r.bId}
                      onChange={(e) => updateTogether(active, i, { bId: e.target.value })}
                    >
                      <option value="">— Select —</option>
                      {state.periods[active].map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button className="px-2 py-1 border rounded-lg" onClick={() => removeTogether(active, i)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" onClick={() => addTogetherRule(active)}>
                + Keep Together Rule
              </button>
            </div>

            <div className="pt-2 border-t flex items-center gap-2">
              <button
                className="mt-3 px-3 py-1.5 rounded-xl border"
                onClick={saveRulesNow}
                title="Save the rules without changing seating"
              >
                Save Rules
              </button>
              <button
                className="mt-3 px-3 py-1.5 rounded-xl border"
                onClick={checkConflictsNow}
                title="Check current seating against the rules"
              >
                Check Conflicts
              </button>
            </div>
          </div>
        )}
      </section>
    )}
  </main>
  {/* ---------- END MAIN ---------- */}
</div>
);
}
// --- End of Chunk 11 --------------------------------------------------------------

// --- Start of Chunk 12 ------------------------------------------------------------
// Utility components: NumberField, clampInt, DeskCard

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
width: ${layout.cardWidth}px,
minHeight: ${layout.cardMinHeight}px,
padding: ${layout.cardPadding}px,
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
width: ${layout.photoWidth}px,
height: ${layout.photoHeight}px,
marginTop: ${layout.photoTopMargin}px,
}}
>
{student?.photo ? (
<img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
) : (
<div className="text-xs text-gray-400">No Photo</div>
)}
</div>

pgsql
Copy
Edit
  {/* Name under the image */}
  <div className="mt-1 w-full px-1 text-center leading-tight text-xs break-words">
    {student?.name || "(empty)"}
  </div>
</div>
);
}
// --- End of Chunk 12 ------------------------------------------------------------
