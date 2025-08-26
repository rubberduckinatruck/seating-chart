import React, { useEffect, useState } from "react";
import { toPng } from "html-to-image";

/* Periods, titles, basic types */
const PERIOD_KEYS = ["p1", "p3", "p4", "p5", "p6"] as const;
type PeriodKey = typeof PERIOD_KEYS[number];
const DEFAULT_PERIOD_TITLES: Record<PeriodKey, string> = {
  p1: "Period 1", p3: "Period 3", p4: "Period 4", p5: "Period 5", p6: "Period 6",
};
type Student = { id: string; name: string; photo: string };
type Roster = Student[];
const ROWS = 6, COLS = 6;

/* Local storage */
const LS_KEY = "sb_multi_period_seating_v1";
const ASSIGN_LS_KEY = "sb_assignments_v1";
function loadState(): AppState | null {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveState(s: AppState) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {} }

/* Rules */
type ApartRule = { aId: string; bId: string };
type TogetherRule = { aId: string; bId: string };
type PeriodRules = { apart: ApartRule[]; together: TogetherRule[] };
interface AppState {
  periods: Record<PeriodKey, Roster>;
  titles: Record<PeriodKey, string>;
  rules: Record<PeriodKey, PeriodRules>;
}
const EMPTY_STATE: AppState = {
  periods: { p1: [], p3: [], p4: [], p5: [], p6: [] },
  titles: { ...DEFAULT_PERIOD_TITLES },
  rules: {
    p1: { apart: [], together: [] }, p3: { apart: [], together: [] },
    p4: { apart: [], together: [] }, p5: { apart: [], together: [] }, p6: { apart: [], together: [] },
  },
};
function ensureRulesShape(s: AppState | null): AppState {
  if (!s) return EMPTY_STATE;
  const base = { ...s };
  if (!base.rules) base.rules = EMPTY_STATE.rules;
  for (const k of PERIOD_KEYS) {
    if (!base.rules[k]) base.rules[k] = { apart: [], together: [] };
    base.rules[k].apart ||= []; base.rules[k].together ||= [];
  }
  return base;
}

/* Utils */
function shuffle<T>(arr: T[]): T[] { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function padToSeats(roster: Roster, seatCount = ROWS * COLS): (Student | null)[] { const out: (Student | null)[] = roster.slice(0, seatCount); while (out.length < seatCount) out.push(null); return out; }
function indexToRowCol(idx: number) { return { row: Math.floor(idx / COLS), col: idx % COLS }; }
function pairKeyForIndex(idx: number) { const { row, col } = indexToRowCol(idx); return `${row}-${Math.floor(col / 2)}`; }
function findSeatIndexById(arr: (Student | null)[], id: string) { return arr.findIndex(s => s && s.id === id); }
function countConflicts(arr: (Student | null)[], rules: PeriodRules) {
  let c = 0;
  for (const r of rules.apart) { if (!r.aId || !r.bId) continue; const ai = findSeatIndexById(arr, r.aId), bi = findSeatIndexById(arr, r.bId); if (ai >= 0 && bi >= 0 && pairKeyForIndex(ai) === pairKeyForIndex(bi)) c++; }
  for (const r of rules.together) { if (!r.aId || !r.bId) continue; const ai = findSeatIndexById(arr, r.aId), bi = findSeatIndexById(arr, r.bId); if (ai < 0 || bi < 0) c++; else if (pairKeyForIndex(ai) !== pairKeyForIndex(bi)) c++; }
  return c;
}

/* Photo manifest + paths (GitHub Pages base-aware) */
function stemToDisplay(stem: string) { return stem.replace(/_/g, " "); }
const BASE: string = (import.meta as any).env?.BASE_URL || "/";
function joinBase(...parts: string[]) {
  const b = BASE.endsWith("/") ? BASE : BASE + "/";
  return b + parts.map(p => p.replace(/^\/+|\/+$/g, "")).join("/");
}
async function loadPeriodFromManifest(period: PeriodKey) {
  const folder = period.toLowerCase();
  const manifestUrl = joinBase("photos", folder, "index.json");
  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`${period} manifest not found`);
  const files: string[] = await res.json();
  const basePath = joinBase("photos", folder) + "/";
  return files.map(f => {
    const stem = f.replace(/\.[^.]+$/, "");
    return { id: stem, name: stemToDisplay(stem), photo: basePath + f } as Student;
  });
}

/* Layout (user-tweakable + persisted) */
type LayoutSettings = {
  withinPairGap: number; pairGap: number; rowGap: number;
  cardWidth: number; cardMinHeight: number; cardPadding: number;
  photoWidth: number; photoHeight: number; photoTopMargin: number;
};
const LAYOUT_LS_KEY = "sb_layout_v1";
const DEFAULT_LAYOUT: LayoutSettings = {
  withinPairGap: 8, pairGap: 22, rowGap: 14,
  cardWidth: 120, cardMinHeight: 156, cardPadding: 8,
  photoWidth: 100, photoHeight: 112, photoTopMargin: 6,
};
function loadLayout(): LayoutSettings {
  try { const raw = localStorage.getItem(LAYOUT_LS_KEY); return raw ? { ...DEFAULT_LAYOUT, ...JSON.parse(raw) } : DEFAULT_LAYOUT; } catch { return DEFAULT_LAYOUT; }
}
function clampInt(v: number, min: number, max: number) { v = Math.round(v); if (Number.isNaN(v)) return min; return Math.min(max, Math.max(min, v)); }

/* Persisted seat-map (IDs only) */
type SeatMap = Record<PeriodKey, (string | null)[]>;
function buildAssignmentsFromSeatMap(state: AppState, seatMap: SeatMap): Record<PeriodKey, (Student | null)[]> {
  const out: Record<PeriodKey, (Student | null)[]> = {} as any;
  for (const k of PERIOD_KEYS) {
    const ids = seatMap?.[k] ?? [];
    const roster = state.periods[k];
    const map = new Map(roster.map(s => [s.id, s]));
    const arr = ids.map(id => (id ? map.get(id) ?? null : null));
    while (arr.length < ROWS * COLS) arr.push(null);
    out[k] = arr.slice(0, ROWS * COLS);
  }
  return out;
}
function serializeSeatMap(assignments: Record<PeriodKey, (Student | null)[]>): SeatMap {
  const sm: SeatMap = {} as any;
  for (const k of PERIOD_KEYS) sm[k] = assignments[k].map(s => (s ? s.id : null));
  return sm;
}

/* Small inputs */
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void; }) {
  return (
    <label className="text-sm">
      <div className="text-gray-600 mb-1">{label}</div>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="border rounded-lg px-2 py-1 w-32" />
    </label>
  );
}

/* Desk card */
function DeskCard({ student, onDragStart, onDragOver, onDrop, layout }: {
  student: Student | null;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void;
  layout: LayoutSettings;
}) {
  return (
    <div
      className="rounded-2xl border shadow-sm bg-white flex flex-col items-center justify-start"
      style={{ width: `${layout.cardWidth}px`, minHeight: `${layout.cardMinHeight}px`, padding: `${layout.cardPadding}px` }}
      draggable={!!student} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} title={student?.name || ""}
    >
      <div className="rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center"
           style={{ width: `${layout.photoWidth}px`, height: `${layout.photoHeight}px`, marginTop: `${layout.photoTopMargin}px` }}>
        {student?.photo ? <img src={student.photo} alt={student.name} className="w-full h-full object-cover" /> : <div className="text-xs text-gray-400">No Photo</div>}
      </div>
      <div className="mt-1 w-full px-1 text-center leading-tight text-xs break-words">{student?.name || "(empty)"}</div>
    </div>
  );
}

/* App */
export default function App() {
  const initialState = ensureRulesShape(loadState() ?? EMPTY_STATE);
  const initialSeatMap = (() => { try { const raw = localStorage.getItem(ASSIGN_LS_KEY); return raw ? JSON.parse(raw) as SeatMap : null; } catch { return null; } })();
  const [state, setState] = useState<AppState>(initialState);
  const [assignments, setAssignments] = useState<Record<PeriodKey, (Student | null)[]>>(
    initialSeatMap ? buildAssignmentsFromSeatMap(initialState, initialSeatMap) :
    (() => { const rec: any = {}; for (const k of PERIOD_KEYS) rec[k] = padToSeats(initialState.periods[k]); return rec; })()
  );
  const [active, setActive] = useState<PeriodKey>("p1");
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [rosterCollapsed, setRosterCollapsed] = useState(true);
  const [rightTab, setRightTab] = useState<"students" | "rules">("students");
  const [layout, setLayout] = useState<LayoutSettings>(() => loadLayout());
  const [layoutOpen, setLayoutOpen] = useState(false);

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => { try { localStorage.setItem(LAYOUT_LS_KEY, JSON.stringify(layout)); } catch {} }, [layout]);
  useEffect(() => { try { localStorage.setItem(ASSIGN_LS_KEY, JSON.stringify(serializeSeatMap(assignments))); } catch {} }, [assignments]);

  function rulesFor(p: PeriodKey) { return state.rules[p] || { apart: [], together: [] }; }
  function setRules(p: PeriodKey, next: PeriodRules) { setState(s => ({ ...s, rules: { ...s.rules, [p]: next } })); }

  function addStudent(period: PeriodKey) {
    const id = `student_${Date.now()}`;
    const roster = [...state.periods[period], { id, name: "First Last", photo: "" }];
    setState(s => ({ ...s, periods: { ...s.periods, [period]: roster } }));
    setAssignments(a => ({ ...a, [period]: a[period].slice() })); // leave seats as-is
  }
  function updateStudent(period: PeriodKey, idx: number, patch: Partial<Student>) {
    const current = state.periods[period][idx]; if (!current) return;
    const currentId = current.id;
    const roster = state.periods[period].slice(); roster[idx] = { ...current, ...patch };
    setState(s => ({ ...s, periods: { ...s.periods, [period]: roster } }));
    setAssignments(a => ({ ...a, [period]: a[period].map(seat => (seat && seat.id === currentId ? { ...seat, ...patch } : seat)) }));
  }
  function removeStudent(period: PeriodKey, idx: number) {
    const current = state.periods[period][idx]; if (!current) return;
    const id = current.id;
    const roster = state.periods[period].slice(); roster.splice(idx, 1);
    setState(s => ({ ...s, periods: { ...s.periods, [period]: roster } }));
    setAssignments(a => ({ ...a, [period]: a[period].map(seat => (seat && seat.id === id ? null : seat)) }));
  }
  function updatePeriod(period: PeriodKey, roster: Roster) {
    setState(s => ({ ...s, periods: { ...s.periods, [period]: roster } }));
    setAssignments(a => ({ ...a, [period]: a[period].slice() }));
  }

  function randomizeWithRules(period: PeriodKey) {
    const roster = state.periods[period], rules = rulesFor(period);
    let best = padToSeats(roster), bestConf = Number.POSITIVE_INFINITY;
    for (let t = 0; t < 1500; t++) {
      const arr = padToSeats(shuffle(roster));
      const conf = countConflicts(arr, rules);
      if (conf === 0) { setAssignments(a => ({ ...a, [period]: arr })); return; }
      if (conf < bestConf) { bestConf = conf; best = arr; }
    }
    setAssignments(a => ({ ...a, [period]: best }));
    if (bestConf > 0) alert(`${bestConf} rule conflict(s) could not be satisfied; showing closest arrangement.`);
  }
  function sortAlpha(period: PeriodKey) {
    const roster = state.periods[period].slice();
    roster.sort((a, b) => (a.name?.split(/\s+/)[0] || "").localeCompare(b.name?.split(/\s+/)[0] || ""));
    // Sorting roster does NOT change seats; only the roster list order.
    setState(s => ({ ...s, periods: { ...s.periods, [period]: roster } }));
  }
  function handleDragStart(idx: number) { setDragFromIdx(idx); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
  function handleDrop(targetIdx: number) {
    if (dragFromIdx === null || dragFromIdx === targetIdx) return;
    setAssignments(prev => {
      const arr = prev[active].slice();
      [arr[dragFromIdx], arr[targetIdx]] = [arr[targetIdx], arr[dragFromIdx]];
      return { ...prev, [active]: arr };
    });
    setDragFromIdx(null);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "seating_state.json"; a.click(); URL.revokeObjectURL(url);
  }
  function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(String(reader.result));
        if (incoming?.periods && incoming?.titles) {
          const normalized = ensureRulesShape(incoming);
          setState(normalized);
          // Do not destroy existing seat map; keep positions but refresh refs to updated roster where possible
          setAssignments(prev => {
            const sm = serializeSeatMap(prev);
            return buildAssignmentsFromSeatMap(normalized, sm);
          });
        }
      } catch { alert("Invalid JSON"); }
    };
    reader.readAsText(f);
  }
  function applyPaste(period: PeriodKey, text: string) {
    const rows = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const roster: Roster = rows.map((line, i) => {
      const [name, photo = ""] = line.split(/,\s*/);
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `s_${i}`;
      return { id, name, photo };
    });
    updatePeriod(period, roster);
  }
  async function loadRostersFromPhotos() {
    try {
      const [p1, p3, p4, p5, p6] = await Promise.all([
        loadPeriodFromManifest("p1"), loadPeriodFromManifest("p3"), loadPeriodFromManifest("p4"),
        loadPeriodFromManifest("p5"), loadPeriodFromManifest("p6"),
      ]);
      const nextPeriods = { p1, p3, p4, p5, p6 };
      setState(s => ({ ...s, periods: nextPeriods }));
      setAssignments({
        p1: padToSeats(p1), p3: padToSeats(p3), p4: padToSeats(p4), p5: padToSeats(p5), p6: padToSeats(p6),
      });
      alert("Rosters loaded from photo manifests.");
    } catch (e: any) { alert(e?.message || "Could not load one or more manifests."); }
  }
  function togglePanel(tab: "students" | "rules") {
    if (rosterCollapsed) { setRightTab(tab); setRosterCollapsed(false); }
    else { if (rightTab === tab) setRosterCollapsed(true); else setRightTab(tab); }
  }
  function checkConflictsNow() {
    const c = countConflicts(assignments[active], rulesFor(active));
    alert(c === 0 ? "No rule conflicts in current seating." : `${c} conflict(s) found in current seating.`);
  }
  async function downloadPNG() {
    const node = document.getElementById("chartCapture"); if (!node) return;
    const dataUrl = await toPng(node as HTMLElement, { pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataUrl; a.download = `${state.titles[active].replace(/\s+/g, "_").toLowerCase()}_seating.png`; a.click();
  }

  const [pasteText, setPasteText] = useState("");
  const seatCol = `${layout.cardWidth}px`;
  const gridTemplateColumns = [seatCol, seatCol, `${layout.pairGap}px`, seatCol, seatCol, `${layout.pairGap}px`, seatCol, seatCol].join(" ");

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">Seating Chart</span>
            <span className="text-sm text-gray-500">(6×6 desks · pairs with spacers)</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportJSON} className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50">Export JSON</button>
            <label className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50 cursor-pointer">Import JSON
              <input type="file" accept="application/json" onChange={importJSON} className="hidden" />
            </label>
            <button onClick={loadRostersFromPhotos} className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50">Load Rosters From Photos</button>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-4 pb-3 flex gap-2">
          {PERIOD_KEYS.map(key => (
            <button key={key} onClick={() => setActive(key)}
              className={"px-3 py-1.5 rounded-xl border text-sm " + (active === key ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50")}>
              {state.titles[key]}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className={rosterCollapsed ? "lg:col-span-12" : "lg:col-span-7"}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-xl font-semibold">{state.titles[active]} — Seating</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button onClick={() => randomizeWithRules(active)} className="px-3 py-1.5 rounded-xl bg-blue-600 text-white">Randomize</button>
                <button onClick={() => sortAlpha(active)} className="px-3 py-1.5 rounded-xl border">Sort A→Z</button>
                <button onClick={downloadPNG} className="px-3 py-1.5 rounded-xl border">Download PNG</button>
                <button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl border">Print</button>
              </div>
              <div className="inline-flex rounded-xl overflow-hidden border">
                <button className={"px-3 py-1.5 text-sm " + (!rosterCollapsed && rightTab === "students" ? "bg-black text-white" : "bg-white")}
                        onClick={() => togglePanel("students")}>Students</button>
                <button className={"px-3 py-1.5 text-sm " + (!rosterCollapsed && rightTab === "rules" ? "bg-black text-white" : "bg-white")}
                        onClick={() => togglePanel("rules")}>Rules</button>
              </div>
              <button onClick={() => setLayoutOpen(v => !v)} className={"px-3 py-1.5 rounded-xl border " + (layoutOpen ? "bg-black text-white" : "bg-white")} title="Layout settings">
                Layout
              </button>
            </div>
          </div>

          {layoutOpen && (
            <div className="mb-4 bg-white rounded-2xl shadow border p-3">
              <div className="flex flex-wrap gap-4">
                <NumberField label="Within-pair gap (px)" value={layout.withinPairGap} onChange={(v) => setLayout({ ...layout, withinPairGap: clampInt(v, 0, 64) })} />
                <NumberField label="Between-pairs gap (px)" value={layout.pairGap} onChange={(v) => setLayout({ ...layout, pairGap: clampInt(v, 0, 120) })} />
                <NumberField label="Row gap (px)" value={layout.rowGap} onChange={(v) => setLayout({ ...layout, rowGap: clampInt(v, 0, 64) })} />
                <NumberField label="Card width (px)" value={layout.cardWidth} onChange={(v) => setLayout({ ...layout, cardWidth: clampInt(v, 80, 220) })} />
                <NumberField label="Card min-height (px)" value={layout.cardMinHeight} onChange={(v) => setLayout({ ...layout, cardMinHeight: clampInt(v, 120, 260) })} />
                <NumberField label="Card padding (px)" value={layout.cardPadding} onChange={(v) => setLayout({ ...layout, cardPadding: clampInt(v, 4, 20) })} />
                <NumberField label="Photo width (px)" value={layout.photoWidth} onChange={(v) => setLayout({ ...layout, photoWidth: clampInt(v, 60, layout.cardWidth - 8) })} />
                <NumberField label="Photo height (px)" value={layout.photoHeight} onChange={(v) => setLayout({ ...layout, photoHeight: clampInt(v, 60, 240) })} />
                <NumberField label="Photo top margin (px)" value={layout.photoTopMargin} onChange={(v) => setLayout({ ...layout, photoTopMargin: clampInt(v, 0, 24) })} />
              </div>
              <div className="mt-3"><button onClick={() => setLayout(DEFAULT_LAYOUT)} className="px-3 py-1.5 rounded-xl border">Reset to defaults</button></div>
            </div>
          )}

          <div id="chartCapture" className="bg-white rounded-2xl shadow p-4 border">
            <div className="text-center text-sm text-gray-500 mb-2">Front of classroom</div>
            <div className="flex justify-center">
              <div className="grid" style={{ gridTemplateColumns, columnGap: `${layout.withinPairGap}px`, rowGap: `${layout.rowGap}px` }}>
                {Array.from({ length: ROWS }).map((_, r) => (
                  <React.Fragment key={r}>
                    {Array.from({ length: 8 }).map((__, vcol) => {
                      if (vcol === 2 || vcol === 5) return <div key={`s-${r}-${vcol}`} />;
                      let logicalCol = vcol; if (vcol >= 6) logicalCol -= 2; else if (vcol >= 3) logicalCol -= 1;
                      const seatIndex = r * COLS + logicalCol;
                      const seat = assignments[active][seatIndex] || null;
                      return (
                        <DeskCard key={`d-${r}-${vcol}`} student={seat}
                                  onDragStart={() => handleDragStart(seatIndex)} onDragOver={handleDragOver} onDrop={() => handleDrop(seatIndex)} layout={layout} />
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </section>

        {!rosterCollapsed && (
          <section className="lg:col-span-5">
            {rightTab === "students" ? (
              <>
                <div className="bg-white rounded-2xl shadow border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100"><tr><th className="p-2">#</th><th className="p-2">Name</th><th className="p-2">Actions</th></tr></thead>
                    <tbody>
                      {state.periods[active].length === 0 && <tr><td colSpan={3} className="p-4 text-gray-500">No students yet.</td></tr>}
                      {state.periods[active].map((s, i) => (
                        <tr key={s.id} className="border-t">
                          <td className="p-2 text-gray-500">{i + 1}</td>
                          <td className="p-2"><input value={s.name} onChange={(e) => updateStudent(active, i, { name: e.target.value })} className="w-full border px-2 py-1" /></td>
                          <td className="p-2"><button onClick={() => removeStudent(active, i)} className="px-2 py-1 border">Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 bg-white rounded-2xl shadow border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Quick Paste Roster</h3>
                    <button onClick={() => applyPaste(active, pasteText)} className="px-3 py-1.5 rounded-xl bg-black text-white">Apply</button>
                  </div>
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6} className="w-full border px-2 py-2 font-mono text-xs" />
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl shadow border p-3 space-y-6">
                <div>
                  <h3 className="font-semibold mb-1">Keep Apart Rules</h3>
                  <p className="text-sm text-gray-500 mb-2">Keep these students out of the same two-seat pair.</p>
                  <div className="space-y-2">
                    {rulesFor(active).apart.map((r, i) => (
                      <div key={`apart-${i}`} className="flex items-center gap-2">
                        <select className="border rounded-lg px-2 py-1 flex-1" value={r.aId} onChange={(e) => {
                          const next = rulesFor(active).apart.slice(); next[i] = { ...next[i], aId: e.target.value }; setRules(active, { ...rulesFor(active), apart: next });
                        }}>
                          <option value="">— Select —</option>
                          {state.periods[active].map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <span className="text-gray-500">and</span>
                        <select className="border rounded-lg px-2 py-1 flex-1" value={r.bId} onChange={(e) => {
                          const next = rulesFor(active).apart.slice(); next[i] = { ...next[i], bId: e.target.value }; setRules(active, { ...rulesFor(active), apart: next });
                        }}>
                          <option value="">— Select —</option>
                          {state.periods[active].map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <button className="px-2 py-1 border rounded-lg" onClick={() => {
                          const next = rulesFor(active).apart.slice(); next.splice(i, 1); setRules(active, { ...rulesFor(active), apart: next });
                        }}>Remove</button>
                      </div>
                    ))}
                  </div>
                  <button className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" onClick={() => {
                    const next = rulesFor(active).apart.concat([{ aId: "", bId: "" }]); setRules(active, { ...rulesFor(active), apart: next });
                  }}>+ Keep Apart Rule</button>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">Keep Together Rules</h3>
                  <p className="text-sm text-gray-500 mb-2">Seat these students in the same two-seat pair.</p>
                  <div className="space-y-2">
                    {rulesFor(active).together.map((r, i) => (
                      <div key={`together-${i}`} className="flex items-center gap-2">
                        <select className="border rounded-lg px-2 py-1 flex-1" value={r.aId} onChange={(e) => {
                          const next = rulesFor(active).together.slice(); next[i] = { ...next[i], aId: e.target.value }; setRules(active, { ...rulesFor(active), together: next });
                        }}>
                          <option value="">— Select —</option>
                          {state.periods[active].map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <span className="text-gray-500">with</span>
                        <select className="border rounded-lg px-2 py-1 flex-1" value={r.bId} onChange={(e) => {
                          const next = rulesFor(active).together.slice(); next[i] = { ...next[i], bId: e.target.value }; setRules(active, { ...rulesFor(active), together: next });
                        }}>
                          <option value="">— Select —</option>
                          {state.periods[active].map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <button className="px-2 py-1 border rounded-lg" onClick={() => {
                          const next = rulesFor(active).together.slice(); next.splice(i, 1); setRules(active, { ...rulesFor(active), together: next });
                        }}>Remove</button>
                      </div>
                    ))}
                  </div>
                  <button className="mt-2 px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50" onClick={() => {
                    const next = rulesFor(active).together.concat([{ aId: "", bId: "" }]); setRules(active, { ...rulesFor(active), together: next });
                  }}>+ Keep Together Rule</button>
                </div>

                <div className="pt-2 border-t flex gap-2">
                  <button className="mt-3 px-3 py-1.5 rounded-xl border" onClick={() => alert("Rules saved.")}>Save Rules</button>
                  <button className="mt-3 px-3 py-1.5 rounded-xl border" onClick={checkConflictsNow}>Check Conflicts</button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
