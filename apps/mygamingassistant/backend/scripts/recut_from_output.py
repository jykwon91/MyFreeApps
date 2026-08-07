"""Deterministic recut from a workflow task-output file (any map).
Usage: python scripts/recut_from_output.py <task-output-path> [results.json]
Treats statuses {RECUT, RECUT_FAILED, GATE_PASSED} as gate-passed. No LLM/credits."""
import json, subprocess, sys
from pathlib import Path

BE = Path(__file__).resolve().parents[1]  # scripts/ -> backend/
PY = str(BE / ".venv" / "Scripts" / "python.exe")
outfile = Path(sys.argv[1])
resultsjson = Path(sys.argv[2]) if len(sys.argv) > 2 else outfile.with_suffix(".results.json")

def extract_json(text):
    k = text.rfind('"recutCount"'); i = text.rfind('{', 0, k) if k >= 0 else text.find('{')
    if i < 0: return None
    depth = 0; instr = False; esc = False
    for j in range(i, len(text)):
        c = text[j]
        if instr:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == '"': instr = False
        else:
            if c == '"': instr = True
            elif c == '{': depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0: return text[i:j+1]
    return None

def spans_ok(loc):
    return bool(loc) and all(isinstance(loc.get(k), list) and len(loc[k]) == 2 for k in ('stand','aim','throw','landing'))

GP = {'RECUT','RECUT_FAILED','GATE_PASSED'}
data = json.loads(extract_json(outfile.read_text(encoding='utf-8', errors='replace')))
recut = []; need = []
for r in data.get('results', []):
    it = r.get('item') or {}; nn = it.get('nn'); loc = r.get('loc'); st = r.get('status')
    if nn is None: continue  # nn=0 (cs=0, first chapter) is valid — don't drop it
    if st in GP and spans_ok(loc): recut.append((nn, it.get('id8'), loc, it.get('chapterEnd')))
    else: need.append((nn, st))
recut.sort(); need.sort()
print(f"gate-passed={len(recut)} need-relocalize={len(need)}: " + ", ".join(f"#{n}({s})" for n, s in need))
ok = 0; fail = 0; out = []
for nn, id8, loc, ce in recut:
    a = [PY, "scripts/recut_lineup_clips.py", id8,
         "--stand", str(loc['stand'][0]), str(loc['stand'][1]),
         "--aim", str(loc['aim'][0]), str(loc['aim'][1]),
         "--throw", str(loc['throw'][0]), str(loc['throw'][1]),
         "--landing", str(loc['landing'][0]), str(loc['landing'][1])]
    if ce: a += ["--chapter-end", str(ce)]
    try:
        pr = subprocess.run(a, cwd=str(BE), capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=150)
        g = "DONE" in (pr.stdout or "")
        tail = ((pr.stdout or pr.stderr or "").strip().splitlines() or [""])[-1][:70]
        print(f"#{nn} {id8} " + ("ok" if g else "FAIL: " + tail))
        ok += g; fail += (not g)
        out.append({"nn": nn, "id8": id8, "loc": loc, "chapterEnd": ce, "recut_ok": bool(g)})
    except Exception as e:
        fail += 1; print(f"#{nn} {id8} ERR {str(e)[:50]}"); out.append({"nn": nn, "id8": id8, "recut_ok": False})
for nn, st in need:
    out.append({"nn": nn, "status": st, "recut_ok": False})
resultsjson.write_text(json.dumps(out, indent=0), encoding='utf-8')
print(f"RECUT: {ok} ok / {fail} fail (of {len(recut)}). {resultsjson.name} written.")
