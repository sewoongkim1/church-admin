# -*- coding: utf-8 -*-
"""교인명부 ① 풀기 (2026-09-29) — dimode 교인목록(이름은 .xls 지만 속은 HTML 표)을 DB 모양 JSON 으로.

  python tools/people/parse_people.py "C:/Projects/교인목록_2026_09_29.xls" --date 2026-09-29

쓰는 곳(저장소 밖): C:/Projects/교인명부_작업/<기준일>/people.json · photo_urls.json
⚠️ 원본 값 칸의 낱말을 하나도 빠뜨리지 않았는지 대조하고(빠짐 0), 빠지면 파일을 쓰지 않고 멈춘다 — 표 모양이 바뀐 것이다.
⚠️ 기타사항·최종수정일·최종심방일·dimode 사진 주소는 DB 에 올리지 않는다(설계 0장). 사진 주소는 photo_urls.json 에만.
⚠️ 교회학교 소속이 없는 분의 「교사」는 비운다 — 내보내기 프로그램이 모두에게 같은 한 사람을 찍는다(2026-09-29 확인).
⚠️ 「청년 리더」는 2026-09-29 에 8,672명 모두 비어 있어 칸을 두지 않았다. 값이 생기면 멈춘다 — 칸을 더할지 정할 것.
"""
import argparse, collections, datetime, json, os, re, sys, unicodedata
import lxml.html

sys.stdout.reconfigure(encoding="utf-8")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK_ROOT = r"C:\Projects\교인명부_작업"


def one(s):
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def lines(el):
    return [one(x) for x in el.text_content().replace("\xa0", " ").split("\n") if one(x)]


def path_of(s):
    return [one(x) for x in one(s).split(">")] if one(s) else []


def shape(x):
    x = re.sub(r"[0-9]", "9", str(x))
    x = re.sub(r"[가-힣]", "가", x)
    return re.sub(r"[A-Za-z]", "a", x)


def records(html):
    """교인 한 분 = (원본 조각, 그 조각의 표)"""
    for p in re.split(r'<tr class="defaultDataTR1"\s*>', html)[1:]:
        yield p, lxml.html.fromstring("<table><tr>" + p + "</tr></table>")


def cells(doc):
    """칸 이름 → 값 칸(td). 「리더」는 앞 칸 이름을 붙여 가른다(목장 리더·청년 리더). 이름 없는 초록 칸은 지번주소."""
    tbl = doc.xpath('.//table[contains(@class,"tablelineno")]')[0]
    d, last, prev = {}, None, None
    for td in tbl.xpath(".//td"):
        cls = td.get("class") or ""
        if "tdtitle4" in cls:
            lab = one(td.text_content())
            if "기타사항" in lab:          # 값이 칸 안이 아니라 title 에 있다 — 올리지 않는다
                last = None
                continue
            if lab == "리더":
                lab = f"{prev} 리더"
            else:
                prev = lab
            last = lab
        elif "tddataListPic" in cls:
            d[last if last else "지번주소"] = td
            last = None
    return tbl, d


def parse_one(p, doc):
    r = {}
    m = re.search(r"RigthPerosonModify\((?:&#39;|')(\d+)", p)
    if not m:
        sys.exit("교인ID 를 못 찾았다 — 표 모양이 바뀌었다")
    r["교인ID"] = int(m.group(1))
    img = doc.xpath('.//img[contains(@id,"_imgP")]')
    r["사진주소"] = img[0].get("src", "") if img else ""
    _, d = cells(doc)

    td = d["이름 (직분)"]
    nm = td.xpath('.//span[contains(@class,"nameCvname")]/span')
    r["이름"] = one(nm[0].text_content()) if nm else ""
    full = one(td.text_content())
    tail = full[len(r["이름"]):] if full.startswith(r["이름"]) else full
    m = re.match(r"\s*\((.*?)\)\s*(.*)$", tail)
    jik, r["성별"] = (m.group(1), one(m.group(2))) if m else ("", one(tail))
    jp = one(jik).split(" ", 1)
    r["직분"] = jp[0]
    r["직분상세"] = jp[1] if len(jp) > 1 else ""

    td = d["생년월일 (나이)"]
    sp = td.xpath("./span")
    r["생년월일"] = one(sp[0].text_content()) if sp else ""
    t = one(td.text_content())
    m = re.search(r"([양음?])\s*\(", t)
    r["양음력"] = m.group(1) if m else ""
    m = re.search(r"\((-?[\d.]+)세\)", t)
    r["나이"] = (float(m.group(1)) if "." in m.group(1) else int(m.group(1))) if m else ""

    ln = lines(d["배우자"])
    r["배우자"] = ln[0] if ln else ""
    r["배우자직분"] = " ".join(ln[1:])

    td = d["신앙세대주"]
    li = td.xpath('.//div[@class="labelInfo"]')
    r["신앙세대주"] = one(li[0].text_content()) if li else ""
    fl = td.xpath('./div[@style="float:left"]')
    r["세대주관계"] = re.sub(r"^의\s*", "", one(fl[1].text_content()) if len(fl) > 1 else "")
    # 세대주의 교인ID — 이름 위에 마우스를 올리면 뜨는 창의 번호(PersonMiniViewJs('36580',…)).
    # 2026-09-29 대조: 관계가 「본인」인 4,334명 중 4,274명이 자기 교인ID 와 같다 → 같은 번호 체계. 가족 묶기에 쓴다.
    m = re.search(r"PersonMiniViewJs\('(\d+)'", lxml.html.tostring(td, encoding="unicode"))
    # 0 은 원본의 「세대주 연결 없음」 값이다(2026-09-29: 20명) — 가족 없음으로 둔다. 0 으로 묶으면 모르는 20명이 한 가족이 된다.
    r["세대주ID"] = int(m.group(1)) if m and int(m.group(1)) > 0 else ""

    ks = [one(x.text_content()) for x in d["교인구분"].xpath("./span")] + ["", "", ""]
    r["교인구분1"], r["교인구분2"], r["교인구분3"] = ks[:3]

    td = d["등록일"]
    sp = td.xpath("./span")
    r["등록일"] = one(sp[0].text_content()) if sp else ""
    m = re.search(r"\(([^)]*)\)", one(td.text_content()))
    r["등록구분"] = one(m.group(1)) if m else ""

    td = d["연락처"]
    sp = td.xpath("./span")
    r["연락처1"] = one(sp[0].text_content()) if sp else ""
    t = one(td.text_content())
    rest = t[len(r["연락처1"]):] if t.startswith(r["연락처1"]) else t
    r["연락처2"] = one(re.sub(r"^\s*,", "", rest))

    r["인도자"] = ", ".join(lines(d["인도자"]))
    r["이메일"] = re.sub(r"\s*@\s*", "@", one(d["이메일"].text_content()))

    mk = path_of(d["목장"].text_content())
    r["목장(전체)"] = " > ".join(mk)
    r["목장1"], r["목장2"], r["목장3"] = (mk + ["", "", ""])[:3]
    r["목장리더"] = ", ".join(lines(d["목장 리더"]))

    sc = path_of(d["교회학교"].text_content())
    r["교회학교(전체)"] = " > ".join(sc)
    r["교회학교부서"] = sc[1] if len(sc) > 1 else ""
    r["교사"] = ", ".join(lines(d["교사"])) if sc else ""

    r["청년(전체)"] = " > ".join(path_of(d["청년"].text_content()))
    youth_leader = ", ".join(lines(d["청년 리더"]))
    if youth_leader:
        sys.exit(f"교인ID {r['교인ID']} 의 「청년 리더」에 값이 생겼다 — DB 칸을 더할지 정한 뒤 이 스크립트를 고칠 것")
    r["선교회"] = ", ".join(lines(d["선교회"]))
    r["주소"] = one(d["주소"].text_content())
    r["지번주소"] = one(d["지번주소"].text_content()) if "지번주소" in d else ""
    # 대조용으로만 읽는다(올리지 않는다)
    r["최종수정일"] = one(d["최종수정일"].text_content())
    r["최종심방일"] = one(d["최종심방일"].text_content())
    return r


def coverage(doc, rec):
    """원본 값 칸의 낱말이 rec 어딘가에 다 있나 — (대조한 수, 못 찾은 것 Counter)"""
    def cellstr(v):
        return str(int(v)) if isinstance(v, float) and v.is_integer() else str(v if v is not None else "")
    toks, parts = set(), []
    for v in rec.values():
        s = cellstr(v)
        parts.append(s)
        toks.update(t for t in re.split(r"[\s(),>]+", s) if t)
    hay = " ".join(parts)
    tbl, _ = cells(doc)
    total, miss = 0, collections.Counter()
    for td in tbl.xpath('.//td[contains(@class,"tddataListPic")]'):
        pv = td.getprevious()
        lab = one(pv.text_content()) if pv is not None else "(지번)"
        if lab == "교사" and not rec["교회학교(전체)"]:
            continue                      # 일부러 비운 자리
        for w in re.split(r"[\s(),>]+", td.text_content().replace("\xa0", " ")):
            if not w or w == "의":
                continue
            if re.fullmatch(r"-?[\d.]*세", w):
                w = w[:-1]
            if not w:
                continue
            total += 1
            if w not in toks and w not in hay:
                miss[(lab, shape(w))] += 1
    return total, miss


def iso_date(s):
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s or ""):
        try:
            return datetime.date(*map(int, s.split("-"))).isoformat()
        except ValueError:
            return None
    return None


def to_db(r):
    phones = [re.sub(r"\D", "", x) for x in (r["연락처1"], r["연락처2"])]
    return {
        "person_id": r["교인ID"], "name": r["이름"], "position": r["직분"], "position_detail": r["직분상세"],
        "gender": r["성별"], "birth": r["생년월일"], "birth_date": iso_date(r["생년월일"]), "lunar": r["양음력"],
        "age": None if r["나이"] == "" else r["나이"],
        "spouse": r["배우자"], "spouse_position": r["배우자직분"],
        "household_head": r["신앙세대주"], "household_rel": r["세대주관계"], "household_id": r["세대주ID"] or None,
        "kind1": r["교인구분1"], "kind2": r["교인구분2"], "kind3": r["교인구분3"],
        "registered": r["등록일"], "registered_date": iso_date(r["등록일"]), "reg_type": r["등록구분"],
        "phone1": r["연락처1"], "phone2": r["연락처2"], "guide": r["인도자"], "email": r["이메일"],
        "mok_path": r["목장(전체)"], "mok1": r["목장1"], "mok2": r["목장2"], "mok3": r["목장3"], "mok_leader": r["목장리더"],
        "school_path": r["교회학교(전체)"], "school_dept": r["교회학교부서"], "teacher": r["교사"],
        "youth_path": r["청년(전체)"], "mission": r["선교회"], "address": r["주소"], "address_jibun": r["지번주소"],
        "name_key": re.sub(r"\s+", "", unicodedata.normalize("NFC", r["이름"])),
        "phone_digits": " ".join(p for p in phones if p),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--date", required=True, help="명단 기준일 YYYY-MM-DD (dimode 에서 내려받은 날)")
    a = ap.parse_args()
    datetime.date.fromisoformat(a.date)
    work = os.path.abspath(os.path.join(WORK_ROOT, a.date))
    try:
        inside = os.path.commonpath([work, REPO]) == REPO
    except ValueError:
        inside = False
    if inside:
        sys.exit("작업 폴더가 저장소 안이다 — 멈춘다")
    html = open(a.src, encoding="utf-8", errors="replace").read()
    recs, total, missing = [], 0, collections.Counter()
    for p, doc in records(html):
        rec = parse_one(p, doc)
        t, miss = coverage(doc, rec)
        total += t
        missing.update(miss)
        recs.append(rec)
    ids = [r["교인ID"] for r in recs]
    if not recs or len(set(ids)) != len(ids):
        sys.exit(f"교인 {len(recs)}명 · 교인ID 겹침 {len(ids) - len(set(ids))} — 멈춘다")
    print(f"교인 {len(recs)}명 · 대조한 낱말 {total} · 못 찾은 낱말 {sum(missing.values())}")
    if missing:
        for k, n in missing.most_common(20):
            print(f"   {n:5d} {k}")
        sys.exit("원본 낱말이 빠졌다 — 파일을 쓰지 않고 멈춘다")
    os.makedirs(work, exist_ok=True)
    people = [to_db(r) for r in recs]
    meta = {"source_date": a.date, "fake": False, "source_file": os.path.basename(a.src), "count": len(people)}
    with open(os.path.join(work, "people.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "people": people}, f, ensure_ascii=False)
    with open(os.path.join(work, "photo_urls.json"), "w", encoding="utf-8") as f:
        json.dump({str(r["교인ID"]): r["사진주소"] for r in recs if r["사진주소"]}, f, ensure_ascii=False)
    print("썼다:", work)


if __name__ == "__main__":
    main()
