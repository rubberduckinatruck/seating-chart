// --- Chunk 1: Imports & Core Constants/Types --------------------------------

import React, { useMemo, useState, useEffect } from "react";
import { toPng } from "html-to-image";

/**
 * Multi-Period Seating Chart (Names + Photos + Rules-ready tags)
 * ----------------------------------------------------------------
 * This chunk defines:
 * - Imports
 * - Period keys and display titles
 * - Core types (PeriodKey, Student, Roster)
 * - Grid constants (ROWS, COLS)
 * - LocalStorage key for the main app state
 */

// Periods (lowercase keys to match /public/photos/<period>/index.json folders)
export const PERIOD_KEYS = ["p1", "p3", "p4", "p5", "p6"] as const;

export const DEFAULT_PERIOD_TITLES: Record<(typeof PERIOD_KEYS)[number], string> = {
  p1: "Period 1",
  p3: "Period 3",
  p4: "Period 4",
  p5: "Period 5",
  p6: "Period 6",
};

export type PeriodKey = (typeof PERIOD_KEYS)[number];

// Student now includes `tags` so we can support tag-based rules/constraints.
export type Student = {
  id: string;          // stable identifier (e.g., "john_smith")
  name: string;        // display name (e.g., "John Smith")
  photo: string;       // absolute or base-aware URL to PNG/JPG in /public/photos
  tags: string[];      // e.g., ["front", "needs_outlet", "near_door"]
};

export type Roster = Student[];

// Seating grid: 6 rows × 6 columns (3 pairs per row: [0-1], [2-3], [4-5])
export const ROWS = 6;
export const COLS = 6;

// LocalStorage key for saving the entire app state (periods, titles, rules, etc.)
export const LS_KEY = "sb_multi_period_seating_v1";

// --- End Chunk 1 -------------------------------------------------------------


// --- Start of Chunk 2 -------------------------------------------------------------
   CHUNK 2 — STATE & PERSISTENCE HELPERS
   - App state load/save (with version)
   - Seat assignments load/save (per device)
   - Layout settings load/save (with your defaults)
   - Grid style builder (centers the grid)
   ============================================================ */

/* ----- LocalStorage keys ----- */
const LS_KEY = "sb_multi_period_seating_v1";      // full app state
const ASSIGN_LS_KEY = "sb_assignments_v1";         // per-period seat grids
const LAYOUT_LS_KEY = "sb_layout_v1";              // UI layout controls

/* ----- App state: load/save with simple versioning + migration ----- */
function saveState(state: AppState) {
  try {
    const payload = { ...state, version: 1 };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {}
}

function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return ensureRulesShape(parsed);
  } catch {
    // corrupted storage — clear and fall back to defaults
    try { localStorage.removeItem(LS_KEY); } catch {}
    return null;
  }
}

/* Ensure older saves still have rules shape (and any new fields) */
function ensureRulesShape(s: AppState | null): AppState {
  if (!s) return {
    periods: { p1: [], p3: [], p4: [], p5: [], p6: [] },
    titles: { p1: "Period 1", p3: "Period 3", p4: "Period 4", p5: "Period 5", p6: "Period 6" },
    rules:  { p1: { apart: [], together: [] },
              p3: { apart: [], together: [] },
              p4: { apart: [], together: [] },
              p5: { apart: [], together: [] },
              p6: { apart: [], together: [] } },
  };

  const base = { ...s };

  // titles fallback
  if (!base.titles) {
    base.titles = { p1: "Period 1", p3: "Period 3", p4: "Period 4", p5: "Period 5", p6: "Period 6" };
  }

  // rules fallback
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

  // periods fallback
  if (!base.periods) {
    base.periods = { p1: [], p3: [], p4: [], p5: [], p6: [] };
  } else {
    for (const k of PERIOD_KEYS) {
      base.periods[k] ||= [];
    }
  }

  return base;
}

/* ----- Seat assignments persistence (per device) ----- */

type Assignments = Record<PeriodKey, (Student | null)[]>;

/**
 * Load persisted seat grids and re-link to the latest roster entries
 * by stable student id. If something is missing, pad with nulls.
 */
function loadAssignments(periods: Record<PeriodKey, Roster>): Assignments | null {
  try {
    const raw = localStorage.getItem(ASSIGN_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    const out: Assignments = {} as any;
    const seatCount = ROWS * COLS;

    PERIOD_KEYS.forEach((k) => {
      const saved = Array.isArray(parsed?.[k]) ? parsed[k] : [];
      const padded: (Student | null)[] = [];

      for (let i = 0; i < seatCount; i++) {
        const cell = saved[i];
        if (cell && cell.id) {
          // re-link with freshest copy of this student from the roster
          const fresh = periods[k].find((s) => s.id === cell.id);
          padded.push(fresh ? { ...fresh } : null);
        } else {
          padded.push(null);
        }
      }

      out[k] = padded;
    });

    return out;
  } catch {
    // corrupted — clear persisted assignments
    try { localStorage.removeItem(ASSIGN_LS_KEY); } catch {}
    return null;
  }
}

function saveAssignments(a: Assignments) {
  try {
    localStorage.setItem(ASSIGN_LS_KEY, JSON.stringify(a));
  } catch {}
}

/* ----- Layout settings (with your provided defaults) ----- */

type LayoutSettings = {
  withinPairGap: number;   // horizontal gap *inside* each pair
  pairGap: number;         // spacer column width between the three pairs
  rowGap: number;          // vertical gap between rows
  cardWidth: number;       // desk card width
  cardMinHeight: number;   // min height of the desk card
  cardPadding: number;     // inner padding of the card
  photoWidth: number;      // student photo box width
  photoHeight: number;     // student photo box height
  photoTopMargin: number;  // gap above the photo inside the card
};

const DEFAULT_LAYOUT: LayoutSettings = {
  withinPairGap: 0,
  pairGap: 120,
  rowGap: 2,
  cardWidth: 120,
  cardMinHeight: 120,
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

function saveLayout(layout: LayoutSettings) {
  try {
    localStorage.setItem(LAYOUT_LS_KEY, JSON.stringify(layout));
  } catch {}
}

/**
 * Build grid style (tracks + gaps) and center the whole grid in its container.
 * Use this on the seating grid container:
 *   <div className="grid" style={buildGridStyle(layout)}>…</div>
 */
function buildGridStyle(layout: LayoutSettings) {
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

  return {
    gridTemplateColumns,
    columnGap: `${layout.withinPairGap}px`,
    rowGap: `${layout.rowGap}px`,
    justifyContent: "center", // <-- centers the grid horizontally
  } as React.CSSProperties;
}

// --- End of Chunk 2 -------------------------------------------------------------

// --- Start of Chunk 3 -------------------------------------------------------------
//
// Rules engine (pairing logic) + non-destructive Rules editor
// • Editing rules NEVER re-seats students.
// • The top toolbar "Randomize" already uses `randomizeWithRules(active)`.
// • The Rules panel only shows a "Save Rules" button (no apply / no shuffle).
//

/* =========================
   (A) Logic & helpers (inside App component)
   ========================= */

// Seat index helpers (pair = two adjacent seats in same row: 0–1, 2–3, 4–5)
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

// Count rule conflicts for a given seating assignment
function countConflicts(arr: (Student | null)[], rules: PeriodRules): number {
  let conflicts = 0;
  // Apart: must NOT share the same pair
  for (const r of rules.apart) {
    if (!r.aId || !r.bId) continue;
    const ai = findSeatIndexById(arr, r.aId);
    const bi = findSeatIndexById(arr, r.bId);
    if (ai < 0 || bi < 0) continue; // one missing; ignore
    if (pairKeyForIndex(ai) === pairKeyForIndex(bi)) conflicts++;
  }
  // Together: MUST share the same pair
  for (const r of rules.together) {
    if (!r.aId || !r.bId) continue;
    const ai = findSeatIndexById(arr, r.aId);
    const bi = findSeatIndexById(arr, r.bId);
    if (ai < 0 || bi < 0) { conflicts++; continue; }
    if (pairKeyForIndex(ai) !== pairKeyForIndex(bi)) conflicts++;
  }
  return conflicts;
}

// Rules accessors + CRUD
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

// Manual, rule-aware randomizer (used by the TOP toolbar button only)
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
    if (conf < bestConf) { bestConf = conf; best = arr; }
  }
  setAssignments((a) => ({ ...a, [period]: best }));
  // No alert here; top toolbar action is explicit & you already see results.
}

// Explicit, non-destructive "Save Rules" button feedback
const [justSavedRules, setJustSavedRules] = useState(false);
function saveRules() {
  try { saveState(state); } catch {}
  setJustSavedRules(true);
  window.setTimeout(() => setJustSavedRules(false), 1200);
}

/* =========================
   (B) Rules panel JSX (replace your current rightTab === "rules" block)
   ========================= */

// Inside your right-panel render where you have:
//   rightTab === "rules" ? ( ... ) : ( ... )
// replace the rules branch with the following:

/*
<div className="bg-white rounded-2xl shadow border p-3 space-y-6">
  <div className="flex items-center justify-between">
    <h3 className="font-semibold">Rules (non-destructive)</h3>
    {justSavedRules && (
      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200">
        Saved
      </span>
    )}
  </div>

  {/* Keep Apart *-/}
  <div>
    <h4 className="font-semibold mb-1">Keep Apart Rules</h4>
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
          <button className="px-2 py-1 border rounded-lg" onClick={() => removeApart(active, i)}>Remove</button>
        </div>
      ))}
    </div>
    <button className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" onClick={() => addApartRule(active)}>
      + Keep Apart Rule
    </button>
  </div>

  {/* Keep Together *-/}
  <div>
    <h4 className="font-semibold mb-1">Keep Together Rules</h4>
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
          <button className="px-2 py-1 border rounded-lg" onClick={() => removeTogether(active, i)}>Remove</button>
        </div>
      ))}
    </div>
    <button className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" onClick={() => addTogetherRule(active)}>
      + Keep Together Rule
    </button>
  </div>

  {/* Footer: ONLY non-destructive save *-/}
  <div className="pt-2 border-t">
    <button
      className="mt-3 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50"
      onClick={saveRules}
    >
      Save Rules
    </button>
    {/* No apply here; seating never changes from this panel. Use top "Randomize". *-/}
  </div>
</div>
*/

// --- End of Chunk 3 -------------------------------------------------------------

// --- Start of Chunk 4 -------------------------------------------------------------
// Front-of-classroom label (centered above the grid)
<div className="mb-2 text-center">
  <div className="inline-block px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
    Front of classroom
  </div>
</div>

{/* Seating grid (centered, 3 pairs per row with spacer columns) */}
<div id="chartCapture" className="bg-white rounded-2xl shadow p-4 border mx-auto">
  <div
    className="grid w-fit mx-auto"
    style={{
      // 2 seats, spacer, 2 seats, spacer, 2 seats
      gridTemplateColumns,
      // horizontal spacing between visible columns (seat↔seat and seat↔spacer)
      columnGap: `${layout.withinPairGap}px`,
      // vertical spacing between rows
      rowGap: `${layout.rowGap}px`,
    }}
  >
    {Array.from({ length: ROWS }).map((_, r) => (
      <React.Fragment key={r}>
        {Array.from({ length: 8 }).map((__, vcol) => {
          // Spacer columns at 2 and 5 to visually separate pairs
          if (vcol === 2 || vcol === 5) return <div key={`s-${r}-${vcol}`} />;

          // Map visual column → logical seat column (0..5)
          let logicalCol = vcol;
          if (vcol >= 6) logicalCol -= 2; // skip both spacers
          else if (vcol >= 3) logicalCol -= 1; // skip first spacer

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
// --- End of Chunk 4 -------------------------------------------------------------

// --- Start of Chunk 5 -------------------------------------------------------------
// Right-hand panel (Students | Rules) and the DeskCard component.
// Paste this in your file where the right panel should render (typically
// right after the seating section inside <main>), and place the DeskCard
// component at the end of the file (or wherever you keep your components).

{/* Right panel — only renders when expanded. No header; the top row handles that. */}
{!rosterCollapsed && (
  <section className="lg:col-span-5">
    {rightTab === "students" ? (
      <>
        {/* STUDENTS TAB */}
        <div className="bg-white rounded-2xl shadow border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">Name</th>
                {/* Photo URL column is intentionally hidden per your preference */}
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
                  {/* Photo URL field removed from UI but kept supported elsewhere */}
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

        {/* Quick Paste stays the same format: "First Last, optionalPhotoUrl" per line */}
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
          />
        </div>
      </>
    ) : (
      /* RULES TAB */
      <div className="bg-white rounded-2xl shadow border p-3 space-y-6">
        {/* Keep Apart */}
        <div>
          <h3 className="font-semibold mb-1">Keep Apart Rules</h3>
          <p className="text-sm text-gray-500 mb-2">
            Keep these students out of the same two-seat pair.
          </p>
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
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
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

        {/* Keep Together */}
        <div>
          <h3 className="font-semibold mb-1">Keep Together Rules</h3>
          <p className="text-sm text-gray-500 mb-2">
            Seat these students in the same two-seat pair.
          </p>
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
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
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

        {/* Save / Check */}
        <div className="pt-2 border-t flex items-center gap-2">
          <button
            className="mt-3 px-3 py-1.5 rounded-xl border"
            onClick={() => {
              try { saveState(state); } catch {}
              alert("Rules saved.");
            }}
          >
            Save Rules
          </button>
          <button
            className="mt-3 px-3 py-1.5 rounded-xl border"
            onClick={() => {
              const current = assignments[active];
              const conflicts = countConflicts(current, rulesFor(active));
              alert(
                conflicts === 0
                  ? "No rule conflicts in the current layout."
                  : `${conflicts} rule conflict(s) in the current layout.`
              );
            }}
          >
            Check Conflicts
          </button>
          {/* Randomize button stays on the main toolbar as requested */}
        </div>
      </div>
    )}
  </section>
)}

/* DeskCard component (no hover tooltip; photo + name, uses layout settings) */
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
          <img src={student.photo} alt={student?.name || "student"} className="w-full h-full object-cover" />
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
// --- End of Chunk 5 -------------------------------------------------------------









