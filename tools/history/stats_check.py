# -*- coding: utf-8 -*-
"""사역 통계 세는 규칙 대조 — 이 PC 에서만(진짜 명단 · 2026-10-06).

  python tools/history/stats_check.py [명단 엑셀 ...]
    기본: C:/Projects/Data/정리/2010-2021_사역임명_통합.xlsx · C:/Projects/Data/2022-2026_사역임명_통합.xlsx

통합 엑셀을 부서 이음표 규칙(dept_lineage_draft.py)으로 가르고, **이름을 사람으로 삼은** 재료를 만들어
서버와 같은 파일(ministry-stats.ts buildStats)에 넣는다. 그 결과를, 여기서 따로 센 값(설계 때 쓴 셈)과 칸마다 맞댄다.
  - 두 셈이 같으면 「세는 규칙을 TS 로 옮기다 틀리지 않았다」는 뜻이다.
  - 운영의 수와는 다르다 — 운영은 교인ID·떠난 분 번호로 사람을 센다(여기는 이름 · 동명이인이 섞인다 · 「떠남」은 0).
수만 찍는다. 이름은 재료에 들어가지 않는다(사람은 번호) · 재료 파일은 저장소 밖 임시 폴더에 두고 끝나면 지운다.
명단이 일부인 해(GAPS)는 SQL 013 의 씨앗과 같게 둔다 — 그쪽을 고치면 여기도.
"""
import collections, importlib.util, json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
spec = importlib.util.spec_from_file_location("lin", os.path.join(HERE, "dept_lineage_draft.py"))
lin = importlib.util.module_from_spec(spec); spec.loader.exec_module(lin)

GROUP_DB = {lin.G_PRAISE: "찬양", lin.G_SCHOOL: "교회학교", lin.G_ETC: "그 밖", lin.G_MOK: "목양", lin.G_ORG: "기관"}   # 엑셀의 「따로 · 목양」 → DB 의 「목양」
THREE = ("찬양", "교회학교", "그 밖")
GAPS = [["*", 2021, 2021], ["g:교회학교", 2014, 2014], ["g:교회학교", 2023, 2024], ["f:재정", 2022, None]]   # = supabase/sql/013_ministry_stats.sql
KEEP_MIN = 5


def js_round(x):
    return int(x + 0.5)          # Math.round 와 같게(양수) — 파이썬 round 는 .5 를 짝수로 보낸다


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    rows = lin.load(sys.argv[1:] or lin.DEFAULT_IN)
    person, maps, seats = {}, {}, []
    for r in rows:
        g, fam, mid, std, _memo, _ask, _open = lin.classify(r["dept"], r["team"])
        m = (GROUP_DB[g], fam, mid, std)
        seats.append([person.setdefault(r["name"], len(person)), r["year"], maps.setdefault(m, len(maps))])
    map_list = [list(m) for m, _ in sorted(maps.items(), key=lambda kv: kv[1])]
    years = sorted({s[1] for s in seats})
    facts = {"years": years, "map": map_list, "seats": seats, "people": [["m", None, "", ""] for _ in person], "gaps": GAPS, "unmapped": [], "source_date": None}

    # ── 따로 세기(설계 때의 셈 · buildStats 를 보지 않고 쓴 것) ──
    present = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    anyyear = collections.defaultdict(set)
    fam_group = {}
    for p, y, mi in seats:
        g, fam, _mid, _std = map_list[mi]
        anyyear[y].add(p)
        fam_group["f:" + fam] = "g:" + g
        for u in ["g:" + g, "f:" + fam] + (["all3"] if g in THREE else []):
            present[u][y][p] += 1

    def is_gap(u, y):
        scopes = {"*", u} | ({fam_group[u]} if u.startswith("f:") else set())
        return any(s in scopes and y >= a and (b is None or y <= b) for s, a, b in GAPS)

    mine = {}
    for u, py in present.items():
        data_years = sorted(py)
        seen, served, out = set(), set(), []
        for y in years:
            P = py.get(y, {})
            prevs = [q for q in data_years if q < y and not is_gap(u, q)]
            row = {"year": y, "seats": sum(P.values()), "people": len(P), "multi": sum(1 for n in P.values() if n >= 2), "gap": is_gap(u, y),
                   "prev": None, "base": None, "stay": None, "back": None, "first": None, "firstEver": None, "firstOther": None,
                   "left": None, "moved": None, "rest": None, "gone": None, "keep": None}
            if prevs and P:
                Q = py[prevs[-1]]
                came = set(P) - set(Q); left = set(Q) - set(P)
                back = {p for p in came if p in seen}
                first = came - back
                first_ever = {p for p in first if p not in served}
                moved = {p for p in left if p in anyyear[y]}
                stay = len(set(P) & set(Q))
                row.update(prev=prevs[-1], base=len(Q), stay=stay, back=len(back), first=len(first), firstEver=len(first_ever),
                           firstOther=len(first - first_ever), left=len(left), moved=len(moved), rest=len(left - moved), gone=0,
                           keep=js_round(stay * 100 / len(Q)) if len(Q) >= KEEP_MIN else None)
            out.append(row)
            seen |= set(P)
            served |= anyyear[y]
        mine[u] = out

    # ── 서버와 같은 파일로 세기 ──
    tmp = tempfile.mkdtemp(prefix="ca-stats-")
    try:
        fp = os.path.join(tmp, "facts.json")
        json.dump(facts, open(fp, "w", encoding="utf-8"), ensure_ascii=False)
        r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", os.path.join(HERE, "stats_check.mjs"), fp],
                           capture_output=True, text=True, encoding="utf-8", cwd=ROOT)
        if r.returncode != 0:
            print("node 실패:", r.stderr[:600]); return 1
        theirs = json.loads(r.stdout)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    keys = theirs["keys"]
    same = diff = 0
    bad = []
    if set(mine) != set(theirs["units"]):
        print("단위가 다르다:", sorted(set(mine) ^ set(theirs["units"]))); return 1
    for u in sorted(mine):
        for a, b in zip(mine[u], theirs["units"][u]["rows"]):
            for k, v in zip(keys, b):
                if a[k] == v: same += 1
                else:
                    diff += 1
                    if len(bad) < 12: bad.append((u, a["year"], k, a[k], v))
        if u.startswith("f:") and fam_group[u] != theirs["units"][u]["group"]:
            diff += 1; bad.append((u, "group", fam_group[u], theirs["units"][u]["group"]))
    print("줄 %d · 사람(이름) %d · 단위 %d · 해 %d" % (len(seats), len(person), len(mine), len(years)))
    print("맞댄 칸 %d · 같음 %d · 다름 %d" % (same + diff, same, diff))
    for b in bad: print("  다름:", b)
    last = mine["all3"][-1]
    print("전체 %d년: 봉사자 %d · 계속 %d · 돌아옴 %d · 처음 %d · 나감 %d · 유지율 %s%% (견준 해 %s)"
          % (last["year"], last["people"], last["stay"], last["back"], last["first"], last["left"], last["keep"], last["prev"]))
    print("안쪽 나눔이 있는 단위:", ", ".join(theirs["inner"]))
    return 1 if diff else 0


if __name__ == "__main__":
    sys.exit(main())
