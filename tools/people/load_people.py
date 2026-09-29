# -*- coding: utf-8 -*-
"""교인명부 ③ 살펴보기 · ④ 넣기 (2026-09-29)

  python tools/people/load_people.py --work "C:/Projects/교인명부_작업/2026-09-29" --target prod            # 살펴보기(아무것도 안 바꿈)
  python tools/people/load_people.py --work "C:/Projects/교인명부_작업/2026-09-29" --target prod --apply    # 넣기

키(저장소 밖): ~/.church-admin/dev.env (DEV_URL · DEV_SERVICE_KEY) · ~/.church-admin/prod.env (PROD_URL · PROD_SERVICE_KEY)
⚠️ 개발에는 가짜 명부만(meta.fake=true), 운영에는 진짜만 — 반대면 멈춘다.
⚠️ 빠지는 사람이 지금 인원의 5% 를 넘으면 멈춘다(exit 2) — 한 교구만 내려받은 파일로 나머지가 지워지는 사고. 정말이면 --allow-drop.
⚠️ 순서: 사진 올리기 → 줄 넣기·고치기 → 빠진 분 지우기(줄·사진) → 올린 기록(church_people_imports · admin_audit).
   기록이 마지막이라 도중에 멈추면 화면의 「명부 기준일」은 옛 날짜 그대로다 — 다시 돌리면 남은 것만 맞춘다.
"""
import argparse, datetime, json, os, sys, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8")
BUCKET = "church-people-photos"
REF = {"dev": "ktpwthwqzgcqcrmsafdo", "prod": "xnomlgydifiqiybervtf"}
DATA_COLS = ["name", "position", "position_detail", "gender", "birth", "birth_date", "lunar", "age", "spouse",
             "spouse_position", "household_head", "household_rel", "household_id", "kind1", "kind2", "kind3", "registered",
             "registered_date", "reg_type", "phone1", "phone2", "guide", "email", "mok_path", "mok1", "mok2", "mok3",
             "mok_leader", "school_path", "school_dept", "teacher", "youth_path", "mission", "address", "address_jibun",
             "name_key", "phone_digits", "has_photo", "photo_hash"]
DROP_LIMIT = 0.05


def load_env(target):
    pre = "DEV" if target == "dev" else "PROD"
    f = os.path.expanduser(f"~/.church-admin/{target}.env")
    if not os.path.exists(f):
        sys.exit(f"{f} 가 없다 — {pre}_URL · {pre}_SERVICE_KEY 두 줄을 넣어 둘 것(저장소 밖)")
    vals = {}
    with open(f, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("export "):
                line = line[7:]
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    url, key = vals.get(pre + "_URL", "").rstrip("/"), vals.get(pre + "_SERVICE_KEY", "")
    if REF[target] not in url:
        sys.exit(f"{f} 의 {pre}_URL 이 {REF[target]} 가 아니다 — 멈춘다")
    if not key:
        sys.exit(f"{f} 에 {pre}_SERVICE_KEY 가 없다")
    return url, key


class Api:
    def __init__(self, url, key):
        self.url, self.key = url, key

    def hdr(self, extra=None):
        h = {"apikey": self.key}
        if not self.key.startswith("sb_secret_"):
            h["Authorization"] = "Bearer " + self.key
        h.update(extra or {})
        return h

    def call(self, method, path, body=None, extra=None, raw=False):
        h = self.hdr(extra)
        data = None
        if body is not None:
            data = body if raw else json.dumps(body, ensure_ascii=False).encode("utf-8")
            if not raw:
                h.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=180) as res:
                t = res.read()
                ctype = res.headers.get_content_type()
                return res.headers, (json.loads(t) if t and ctype == "application/json" else None)
        except urllib.error.HTTPError as e:
            sys.exit(f"{method} {path.split('?')[0]} → {e.code} {e.read()[:300]!r}")


def fetch_current(api):
    out, start = {}, 0
    cols = ",".join(["person_id"] + DATA_COLS)
    while True:
        _, rows = api.call("GET", f"/rest/v1/church_people?select={cols}&order=person_id",
                           extra={"Range-Unit": "items", "Range": f"{start}-{start + 999}"})
        if not rows:
            return out
        for r in rows:
            out[r["person_id"]] = r
        start += len(rows)


def same(a, b):
    for c in DATA_COLS:
        x, y = a.get(c), b.get(c)
        if c == "age":
            if (x is None) != (y is None) or (x is not None and float(x) != float(y)):
                return False
        elif (x if x is not None else "") != (y if y is not None else ""):
            return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--target", required=True, choices=["dev", "prod"])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--allow-drop", action="store_true")
    a = ap.parse_args()
    with open(os.path.join(a.work, "people.json"), encoding="utf-8") as f:
        data = json.load(f)
    with open(os.path.join(a.work, "photos.json"), encoding="utf-8") as f:
        photos = json.load(f)
    fake = bool(data["meta"].get("fake"))
    if a.target == "dev" and not fake:
        sys.exit("개발에는 가짜 명부만 넣는다 — 진짜 명단은 운영에만(설계 1장)")
    if a.target == "prod" and fake:
        sys.exit("운영에 가짜 명부를 넣으려 한다 — 멈춘다")
    api = Api(*load_env(a.target))

    new = {}
    for p in data["people"]:
        ph = photos.get(str(p["person_id"]))
        new[p["person_id"]] = {**p, "has_photo": bool(ph), "photo_hash": ph["hash"] if ph else ""}
    cur = fetch_current(api)
    added = [i for i in new if i not in cur]
    changed = [i for i in new if i in cur and not same(cur[i], new[i])]
    removed = [i for i in cur if i not in new]
    up_photos = [i for i in new if new[i]["has_photo"] and (i not in cur or cur[i].get("photo_hash") != new[i]["photo_hash"])]
    del_photos = [i for i in cur if cur[i].get("has_photo") and (i not in new or not new[i]["has_photo"])]
    print(f"[{a.target}] 기준일 {data['meta']['source_date']} · 파일 {len(new)}명 · 지금 DB {len(cur)}명")
    print(f"  새로 {len(added)} · 바뀜 {len(changed)} · 빠짐 {len(removed)} · 사진 올림 {len(up_photos)} · 사진 지움 {len(del_photos)}")
    if cur and len(removed) > DROP_LIMIT * len(cur) and not a.allow_drop:
        print(f"⚠️ 빠지는 분이 {len(removed)}명({len(removed) / len(cur):.1%}) — {DROP_LIMIT:.0%} 를 넘어 멈춘다.")
        print("   한 교구만 내려받은 파일이 아닌지 확인하고, 정말이면 --allow-drop 을 붙인다.")
        sys.exit(2)
    if not a.apply:
        print("살펴보기만 했다 — 넣으려면 --apply")
        return

    def upload(pid):
        with open(os.path.join(a.work, "photos", f"{pid}.jpg"), "rb") as f:
            b = f.read()
        api.call("POST", f"/storage/v1/object/{BUCKET}/{pid}.jpg", b,
                 {"Content-Type": photos[str(pid)]["mime"], "x-upsert": "true"}, raw=True)

    with ThreadPoolExecutor(max_workers=6) as ex:
        for n, _ in enumerate(ex.map(upload, up_photos), 1):
            if n % 500 == 0:
                print(f"  사진 {n}/{len(up_photos)}", flush=True)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    rows = [{"person_id": i, **{c: new[i].get(c) for c in DATA_COLS}, "updated_at": now} for i in added + changed]
    for k in range(0, len(rows), 500):
        api.call("POST", "/rest/v1/church_people?on_conflict=person_id", rows[k:k + 500],
                 {"Prefer": "resolution=merge-duplicates,return=minimal"})
    for k in range(0, len(removed), 200):
        chunk = ",".join(str(i) for i in removed[k:k + 200])
        api.call("DELETE", f"/rest/v1/church_people?person_id=in.({chunk})", extra={"Prefer": "return=minimal"})
    for k in range(0, len(del_photos), 200):
        api.call("DELETE", f"/storage/v1/object/{BUCKET}", {"prefixes": [f"{i}.jpg" for i in del_photos[k:k + 200]]})
    rec = {"source_date": data["meta"]["source_date"], "total": len(new), "added": len(added),
           "changed": len(changed), "removed": len(removed), "photos": len(up_photos)}
    _, imp = api.call("POST", "/rest/v1/church_people_imports", rec, {"Prefer": "return=representation"})
    api.call("POST", "/rest/v1/admin_audit", {"member_id": None, "action": "people.import",
                                               "target": str(imp[0]["id"]), "detail": rec}, {"Prefer": "return=minimal"})
    h, _ = api.call("GET", "/rest/v1/church_people?select=person_id", extra={"Prefer": "count=exact", "Range": "0-0"})
    total = int((h.get("Content-Range") or "*/0").split("/")[-1])
    print(f"넣었다 — DB {total}명(파일 {len(new)}명) · 올린 기록 #{imp[0]['id']}")
    if total != len(new):
        sys.exit("DB 인원과 파일 인원이 다르다 — 확인할 것")


if __name__ == "__main__":
    main()
