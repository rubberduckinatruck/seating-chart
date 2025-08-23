import React, { useEffect, useState } from "react";

/**
 * Multi-Period Seating Chart (ShuffleBuddy-style)
 * - 6 rows × 3 paired columns (6×6 desks), with spacer columns between each pair
 * - Separate pages (tabs) for periods: 1,3,4,5,6
 * - Randomize, Sort A→Z (first name), Manual drag-and-drop
 * - Photos + names on cards
 * - Local save via localStorage; Export/Import JSON; Download PNG
 */

// ---- Types / Constants ----
const PERIOD_KEYS = ["P1", "P3", "P4", "P5", "P6"] as const;
type PeriodKey = typeof PERIOD_KEYS[number];

const DEFAULT_PERIOD_TITLES: Record<PeriodKey, string> = {
  P1: "Period 1",
  P3: "Period 3",
  P4: "Period 4",
  P5: "Period 5",
  P6: "Period 6",
};

type Student = {
  id: string;     // stable id, e.g., first_last
  name: string;   // display name
  photo: string;  // image URL (PNG)
};

type Roster = Student[];

interface AppState {
  periods: Record<PeriodKey, Roster>;
  titles: Record<PeriodKey, string>;
}

const ROWS = 6;
const COLS = 6;
const LS_KEY = "sb_multi_period_seating_v1";

// ---- Utilities ----
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
function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveState(state: AppState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {}
}

// ---- Initial State ----
const EMPTY_STATE: AppState = {
  periods: { P1: [], P3: [], P4: [], P5: [], P6: [] },
  titles: { ...DEFAULT_PERIOD_TITLES },
};

// ---- App ----
export default function App() {
  const [state, setState] = useState<AppState>(() => loadState() ?? EMPTY_STATE);
  const [active, setActive] = useState<PeriodKey>("P1");
  const [assignments, setAssignments] = useState<Record<PeriodKey, (Student | null)[]>>(() => ({
    P1: padToSeats(state.periods.P1),
    P3: padToSeats(state.periods.P3),
    P4: padToSeats(state.periods.P4),
    P5: padToSeats(state.periods.P5),
    P6: padToSeats(state.periods.P6),
  }));

  // Save to localStorage whenever state changes
  useEffect(() => { saveState(state); }, [state]);

  // Re-pad seats when switching active period
  useEffect(() => {
    setAssignments(prev => ({
      ...prev,
      [active]: padToSeats(prev[active]?.filter(Boolean) as Student[]),
    }));
  }, [active]);

  // ---- Roster editing ----
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

  // ---- Randomize / Sort ----
  function randomize(period: PeriodKey) {
    const roster = state.periods[period];
    setAssignments(a => ({ ...a, [period]: padToSeats(shuffle(roster)) }));
  }
  function sortAlpha(period: PeriodKey) {
    const roster = state.periods[period].slice();
    roster.sort((a, b) => {
      const fa = (a.name?.trim().split(/\s+/)[0] || "").toLowerCase();
      const fb = (b.name?.trim().split(/\s+/)[0] || "").toLowerCase();
      return fa.localeCompare(fb);
    });
    setAssignments(a => ({ ...a, [period]: padToSeats(roster) }));
  }

  // ---- Drag & Drop manual move (swap seats) ----
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  function handleDragStart(index: number) { setDragFromIdx(index); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
  function handleDrop(targetIdx: number) {
    if (dragFromIdx === null || dragFromIdx === targetIdx) return;
    setAssignments(prev => {
      const arr = prev[active].slice();
      const temp = arr[targetIdx];
      arr[targetIdx] = arr[dragFromIdx];
      arr[dragFromIdx] = temp;
      return { ...prev, [active]: arr };
    });
    setDragFromIdx(null);
  }

  // ---- Export / Import JSON ----
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
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(String(reader.result));
        if (incoming && incoming.periods && incoming.titles) {
          setState(incoming);
          setAssignments({
            P1: padToSeats(incoming.periods.P1),
            P3: padToSeats(incoming.periods.P3),
            P4: padToSeats(incoming.periods.P4),
            P5: padToSeats(incoming.periods.P5),
            P6: padToSeats(incoming.periods.P6),
          });
        }
      } catch {
        alert("Invalid JSON");
      }
    };
    reader.readAsText(file);
  }

  // ---- Paste Roster Wizard (Name,PhotoURL per line) ----
  const [pasteText, setPasteText] = useState("");
  function applyPaste(period: PeriodKey) {
    const rows = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const roster: Roster = rows.map((line, i) => {
      const [name, photo = ""] = line.split(/,\s*/);
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `s_${i}`;
      return { id, name, photo };
    });
    updatePeriod(period, roster);
    setPasteText("");
  }

  // ---- Download Seating Chart as PNG ----
  async function downloadPNG() {
    const node = document.getElementById("chartCapture");
    if (!node) { alert("Chart area not found"); return; }
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, { pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${state.titles[active].replace(/\s+/g, "_").toLowerCase()}_seating.png`;
      a.click();
    } catch (err) {
      console.error(err);
      alert("Could not generate image. Try refreshing once and retry.");
    }
  }

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
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-4 pb-3 flex gap-2">
          {PERIOD_KEYS.map(key => (
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

      <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Seating chart */}
        <section className="lg:col-span-7">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">{state.titles[active]} — Seating</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => randomize(active)} className="px-3 py-1.5 rounded-xl bg-blue-600 text-white shadow hover:bg-blue-700">Randomize</button>
              <button onClick={() => sortAlpha(active)} className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50">Sort A→Z</button>
              <button onClick={downloadPNG} className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50">Download PNG</button>
              <button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50">Print</button>
            </div>
          </div>

          {/* Grid: 6 rows × (8 visual columns with 2 spacers) */}
          <div id="chartCapture" className="bg-white rounded-2xl shadow p-4 border">
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
                columnGap: "12px",
                rowGap: "12px",
              }}
            >
              {/* Render 6 rows; for each row render 8 columns; spacers at visual col 2 and 5 */}
              {Array.from({ length: ROWS }).map((_, r) => (
                <React.Fragment key={r}>
                  {Array.from({ length: 8 }).map((__, vcol) => {
                    const isSpacer = vcol === 2 || vcol === 5;
                    if (isSpacer) return <div key={`s-${r}-${vcol}`} />;
                    // Map visual col back to logical col 0..5
                    let logicalCol = vcol;
                    if (vcol >= 6) logicalCol = vcol - 2; // 6,7 → 4,5
                    else if (vcol >= 3) logicalCol = vcol - 1; // 3,4 → 2,3
                    const seatIndex = r * COLS + logicalCol;
                    const seat = assignments[active][seatIndex] || null;
                    return (
                      <DeskCard
                        key={`d-${r}-${vcol}`}
                        student={seat}
                        seatIndex={seatIndex}
                        onDragStart={() => handleDragStart(seatIndex)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(seatIndex)}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* Right: Roster editor */}
        <section className="lg:col-span-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">{state.titles[active]} — Roster</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => addStudent(active)} className="px-3 py-1.5 rounded-xl border shadow-sm hover:bg-gray-50">Add Student</button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2 w-[36px]">#</th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Photo URL</th>
                  <th className="text-left p-2 w-[80px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.periods[active].length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-gray-500">No students yet. Paste below or add manually.</td></tr>
                )}
                {state.periods[active].map((s, i) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2 text-gray-500">{i + 1}</td>
                    <td className="p-2">
                      <input
                        value={s.name}
                        onChange={e => updateStudent(active, i, { name: e.target.value })}
                        className="w-full px-2 py-1 rounded-lg border focus:outline-none focus:ring"
                        placeholder="First Last"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={s.photo}
                        onChange={e => updateStudent(active, i, { photo: e.target.value })}
                        className="w-full px-2 py-1 rounded-lg border focus:outline-none focus:ring"
                        placeholder="https://.../first_last.png"
                      />
                    </td>
                    <td className="p-2">
                      <button onClick={() => removeStudent(active, i)} className="px-2 py-1 rounded-lg border hover:bg-gray-50">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paste Wizard */}
          <div className="mt-4 bg-white rounded-2xl shadow border p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Quick Paste Roster</h3>
              <button onClick={() => applyPaste(active)} className="px-3 py-1.5 rounded-xl bg-black text-white hover:bg-gray-800">
                Apply to {state.titles[active]}
              </button>
            </div>
            <p className="text-xs text-gray-600 mb-2">
              Paste one per line: <code>Name, PhotoURL</code> or just <code>Name</code>. Example:<br />
              <code>Alex Smith, /images/alex_smith.png</code>
            </p>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={6}
              className="w-full px-2 py-2 rounded-lg border focus:outline-none focus:ring font-mono text-xs"
              placeholder={`First Last, /images/first_last.png\nFirst Last2, https://.../first_last2.png`}
            />
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-gray-500">
        <p>Fixed desk layout with spacer columns; local-only save; export/import; print- and PNG-friendly.</p>
      </footer>

      {/* Print Styles */}
      <style>{`
        @media print {
          header, footer, .no-print { display: none !important; }
          main { grid-template-columns: 1fr !important; }
          section:nth-child(2) { display: none; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}

function DeskCard({
  student,
  seatIndex,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  student: Student | null;
  seatIndex: number;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  return (
    <div
      className="rounded-2xl border shadow-sm bg-white p-2 flex items-center gap-2 min-h-[88px]"
      draggable={!!student}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={student?.name || ""}
    >
      <div className="w-[64px] h-[64px] rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
        {student?.photo ? (
          <img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
        ) : (
          <div className="text-xs text-gray-400">No Photo</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{student?.name || "(empty)"}</div>
        {student && <div className="text-[11px] text-gray-500 truncate">{student.id}</div>}
      </div>
    </div>
  );
}
