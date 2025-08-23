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
 * • Persistent in localStorage
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
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}

interface AppState {
  periods: Record<PeriodKey, Roster>;
  titles: Record<PeriodKey, string>;
}

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

/* ---------- ADDED HELPERS FOR PHOTO MANIFESTS (lowercase-only + base-aware) ---------- */
function stemToDisplay(stem: string) {
  return stem.replace(/_/g, " ");
}

// Use Vite's base so paths work on GitHub Pages (/seating-chart/)
const BASE = (import.meta as any).env?.BASE_URL || "/";

// join helper that respects BASE and avoids double slashes
function joinBase(...parts: string[]) {
  const b = BASE.endsWith("/") ? BASE : BASE + "/";
  return b + parts.map(p => p.replace(/^\/+|\/+$/g, "")).join("/");
}

async function loadPeriodFromManifest(period: "p1"|"p3"|"p4"|"p5"|"p6") {
  // lowercase folders only (p1, p3, ...)
  const folder = period.toLowerCase();
  const manifestUrl = joinBase("photos", folder, "index.json");

  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`${period} manifest not found`);

  const files: string[] = await res.json(); // e.g., ["John_Smith.png", ...]
  const basePath = joinBase("photos", folder) + "/";

  return files.map(filename => {
    const stem = filename.replace(/\.[^.]+$/, "");
    return {
      id: stem,
      name: stemToDisplay(stem),
      photo: basePath + filename,
    } as Student;
  });
}
/* ---------- END ADDED HELPERS ---------- */

const EMPTY_STATE: AppState = {
  periods: { p1: [], p3: [], p4: [], p5: [], p6: [] },
  titles: { ...DEFAULT_PERIOD_TITLES },
};

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState() ?? EMPTY_STATE);
  const [active, setActive] = useState<PeriodKey>("p1");
  const [assignments, setAssignments] = useState<Record<PeriodKey, (Student | null)[]>>(() => {
    const rec: Record<PeriodKey, (Student | null)[]> = {} as any;
    PERIOD_KEYS.forEach(k => { rec[k] = padToSeats(state.periods[k]); });
    return rec;
  });

  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);

  useEffect(() => { saveState(state); }, [state]);

  // ---- Editing ----
  function addStudent(period: PeriodKey) {
    const id = `student_${Date.now()}`;
    updatePeriod(period, [...state.periods[period], { id, name: "First Last", photo: "" }]);
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
    setState(s => ({ ...s, periods: { ...s.periods, [period]: roster } }));
    setAssignments(a => ({ ...a, [period]: padToSeats(roster) }));
  }

  // ---- Actions ----
  function randomize(period: PeriodKey) {
    setAssignments(a => ({ ...a, [period]: padToSeats(shuffle(state.periods[period])) }));
  }
  function sortAlpha(period: PeriodKey) {
    const roster = state.periods[period].slice();
    roster.sort((a, b) => (a.name?.split(/\s+/)[0] || "").localeCompare(b.name?.split(/\s+/)[0] || ""));
    setAssignments(a => ({ ...a, [period]: padToSeats(roster) }));
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
  async function downloadPNG() {
    const node = document.getElementById('chartCapture');
    if (!node) return;
    const dataUrl = await toPng(node as HTMLElement, { pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${state.titles[active].replace(/\s+/g, '_').toLowerCase()}_seating.png`;
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
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(String(reader.result));
        if (incoming?.periods && incoming?.titles) {
          setState(incoming);
          const rec: any = {}; PERIOD_KEYS.forEach(k => { rec[k] = padToSeats(incoming.periods[k]); });
          setAssignments(rec);
        }
      } catch { alert("Invalid JSON"); }
    };
    reader.readAsText(f);
  }

  // ---- Paste Wizard ----
  const [pasteText, setPasteText] = useState("");
  function applyPaste(period: PeriodKey) {
    const rows = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const roster: Roster = rows.map((line, i) => {
      const [name, photo = ""] = line.split(/,\s*/);
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `s_${i}`;
      return { id, name, photo };
    });
    updatePeriod(period, roster);
    setPasteText("");
  }

  /* ---------- ADDED: LOAD ROSTERS FROM PHOTO MANIFESTS (ALL PERIODS) ---------- */
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
      setState(s => ({
        ...s,
        periods: { p1: p1, p3: p3, p4: p4, p5: p5, p6: p6 }
      }));
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
  /* ---------- END ADDED ---------- */

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
            <label className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50 cursor-pointer">
              Import JSON
              <input type="file" accept="application/json" onChange={importJSON} className="hidden" />
            </label>
            {/* ---------- ADDED BUTTON TO LOAD FROM PHOTO MANIFESTS ---------- */}
            <button onClick={loadRostersFromPhotos} className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50">
              Load Rosters From Photos
            </button>
            {/* ---------- END ADDED ---------- */}
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-4 pb-3 flex gap-2">
          {PERIOD_KEYS.map(key => (
            <button key={key} onClick={() => setActive(key)}
              className={"px-3 py-1.5 rounded-xl border text-sm " + (active===key?"bg-black text-white border-black":"bg-white hover:bg-gray-50")}>{state.titles[key]}</button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">{state.titles[active]} — Seating</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => randomize(active)} className="px-3 py-1.5 rounded-xl bg-blue-600 text-white">Randomize</button>
              <button onClick={() => sortAlpha(active)} className="px-3 py-1.5 rounded-xl border">Sort A→Z</button>
              <button onClick={downloadPNG} className="px-3 py-1.5 rounded-xl border">Download PNG</button>
              <button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl border">Print</button>
            </div>
          </div>

          <div id="chartCapture" className="bg-white rounded-2xl shadow p-4 border">
            <div className="grid" style={{gridTemplateColumns:"repeat(8, minmax(0, 1fr))", columnGap:"12px", rowGap:"12px"}}>
              {Array.from({ length: ROWS }).map((_, r) => (
                <React.Fragment key={r}>
                  {Array.from({ length: 8 }).map((__, vcol) => {
                    if (vcol===2 || vcol===5) return <div key={`s-${r}-${vcol}`} />;
                    let logicalCol = vcol; if (vcol>=6) logicalCol-=2; else if (vcol>=3) logicalCol-=1;
                    const seatIndex = r*COLS+logicalCol;
                    const seat = assignments[active][seatIndex]||null;
                    return <DeskCard key={`d-${r}-${vcol}`} student={seat}
                      onDragStart={()=>handleDragStart(seatIndex)}
                      onDragOver={handleDragOver}
                      onDrop={()=>handleDrop(seatIndex)} />;
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        <section className="lg:col-span-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">{state.titles[active]} — Roster</h2>
            <button onClick={()=>addStudent(active)} className="px-3 py-1.5 rounded-xl border">Add Student</button>
          </div>
          <div className="bg-white rounded-2xl shadow border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100"><tr><th className="p-2">#</th><th className="p-2">Name</th><th className="p-2">Photo URL</th><th className="p-2">Actions</th></tr></thead>
              <tbody>
                {state.periods[active].length===0 && <tr><td colSpan={4} className="p-4 text-gray-500">No students yet.</td></tr>}
                {state.periods[active].map((s,i)=>(
                  <tr key={s.id} className="border-t">
                    <td className="p-2 text-gray-500">{i+1}</td>
                    <td className="p-2"><input value={s.name} onChange={e=>updateStudent(active,i,{name:e.target.value})} className="w-full border px-2 py-1"/></td>
                    <td className="p-2"><input value={s.photo} onChange={e=>updateStudent(active,i,{photo:e.target.value})} className="w-full border px-2 py-1"/></td>
                    <td className="p-2"><button onClick={()=>removeStudent(active,i)} className="px-2 py-1 border">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 bg-white rounded-2xl shadow border p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Quick Paste Roster</h3>
              <button onClick={()=>applyPaste(active)} className="px-3 py-1.5 rounded-xl bg-black text-white">Apply</button>
            </div>
            <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)} rows={6} className="w-full border px-2 py-2 font-mono text-xs"/>
          </div>
        </section>
      </main>
    </div>
  );
}

function DeskCard({ student, onDragStart, onDragOver, onDrop }:{ student: Student|null; onDragStart:()=>void; onDragOver:(e:React.DragEvent)=>void; onDrop:()=>void }) {
  return (
    <div className="rounded-2xl border shadow-sm bg-white p-2 flex items-center gap-2 min-h-[88px]"
      draggable={!!student} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="w-[64px] h-[64px] rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
        {student?.photo ? <img src={student.photo} alt={student.name} className="w-full h-full object-cover"/> : <div className="text-xs text-gray-400">No Photo</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{student?.name || "(empty)"}</div>
      </div>
    </div>
  );
}
