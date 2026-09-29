# -*- coding: utf-8 -*-
"""교인명부 — 개발 DB 용 가짜 명부 (2026-09-29). 진짜 명단은 개발에 넣지 않는다(설계 1장).

  python tools/people/fake_people.py              # 1판: 100명 · 사진 33장
  python tools/people/fake_people.py --variant 2  # 2판: 3명 빠짐 · 5명 직분 바뀜 · 2명 새로 · 사진 1장 바뀜
  python tools/people/fake_people.py --variant 3  # 3판: 10명 빠짐(5% 멈춤 시험 — 넣지 않는다)

쓰는 곳: C:/Projects/교인명부_작업/fake/ — meta.fake = true 라 운영에는 못 넣는다(load_people.py 가 거절).
"""
import argparse, datetime, hashlib, json, os, random, shutil, sys
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
WORK = os.path.join(r"C:\Projects\교인명부_작업", "fake")
SURNAMES = "김이박최정강조윤장임한오서신권황안송류홍"
GIVEN = ["하늘", "바다", "가람", "나래", "다온", "라온", "마루", "보람", "새봄", "아라",
         "우람", "이슬", "초롱", "한결", "해솔", "누리", "도담", "미르", "별하", "온유"]
GU = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨"]
POS = [("집사", "서리집사"), ("권사", "시무권사"), ("안수집사", "시무안수집사"), ("장로", "시무장로"), ("성도", ""), ("", "")]
KIND3 = ["출석교인", "관리교인", "가끔교인"]
DEPTS = ["고등부", "중등부", "유년1부"]


def blank(pid):
    keys = ["name", "position", "position_detail", "gender", "birth", "lunar", "spouse", "spouse_position",
            "household_head", "household_rel", "kind1", "kind2", "kind3", "registered", "reg_type", "phone1", "phone2",
            "guide", "email", "mok_path", "mok1", "mok2", "mok3", "mok_leader", "school_path", "school_dept", "teacher",
            "youth_path", "mission", "address", "address_jibun", "name_key", "phone_digits"]
    r = {k: "" for k in keys}
    r.update({"person_id": pid, "birth_date": None, "registered_date": None, "age": None, "household_id": None})
    return r


def name_of(i):
    # ⚠️ 사람마다 따로 뽑는다 — 한 줄기로 이어 뽑으면 2판에서 몇 명만 빠져도 뒤의 모두가 「바뀜」이 된다
    if i in (5, 12):
        return "김하늘"          # 5·12 는 같은 이름(확인 필요 시험)
    rnd = random.Random(f"name-{i}")
    return rnd.choice(SURNAMES) + rnd.choice(GIVEN)


def person(i):
    rnd = random.Random(f"fake-{i}")
    r = blank(900000 + i)
    r["name"] = name_of(i)
    r["gender"] = "남" if i % 2 else "여"
    r["kind1"] = "교인"
    # 가족 — 1~60 은 셋씩 한 가족(첫 분이 세대주), 나머지는 혼자 세대주
    head = i - (i - 1) % 3 if i <= 60 else i
    r["household_id"] = 900000 + head
    r["household_head"] = name_of(head)
    r["household_rel"] = ["본인", "처", "아들1"][(i - 1) % 3] if i <= 60 else "본인"
    if i <= 70:
        gu, n = GU[head % 7], 1 + head % 12      # 가족은 같은 목장
        r.update(mok1=gu, mok2=gu, mok3=f"{gu}-{n:02d}목장", mok_path=f"{gu} > {gu} > {gu}-{n:02d}목장",
                 kind2="장년", kind3=KIND3[i % 3])
        r["position"], r["position_detail"] = POS[i % len(POS)]
        age = rnd.randint(30, 85)
    elif i <= 80:
        r.update(mok1="새가족", mok2="2026", mok3=f"{1 + i % 9}월", mok_path=f"새가족 > 2026 > {1 + i % 9}월",
                 kind2="장년", kind3="출석교인")
        age = rnd.randint(25, 70)
    elif i <= 90:
        r.update(mok1="청년부", mok2="청년1", mok3=f"청년-{i % 5 + 1:02d}", mok_path=f"청년부 > 청년1 > 청년-{i % 5 + 1:02d}",
                 kind2="청년", kind3="청년출석", youth_path="청년부 > 청년1부")
        age = rnd.randint(20, 34)
    else:
        dept = DEPTS[i % 3]
        r.update(school_dept=dept, school_path=f"교육위원회 > {dept} > 1학년 > 1반", teacher="시험교사(010-0000-9999)",
                 kind2="교회학교", kind3="출석교인")
        age = rnd.randint(8, 18)
    r["age"] = age
    r["birth"] = r["birth_date"] = f"{2026 - age}-03-15"
    r["lunar"] = "양"
    r["registered"] = r["registered_date"] = f"{2010 + i % 15}-05-02"
    r["reg_type"] = "세례" if i % 2 else ""
    r["phone1"] = f"010-0000-{i:04d}"
    r["address"] = f"시험시 시험구 시험로 {i}"
    r["name_key"] = r["name"]
    r["phone_digits"] = r["phone1"].replace("-", "")
    return r


def photo(pid, color, folder):
    p = os.path.join(folder, f"{pid}.jpg")
    Image.new("RGB", (120, 160), color).save(p, "JPEG", quality=80)
    with open(p, "rb") as f:
        return {"hash": hashlib.md5(f.read()).hexdigest(), "mime": "image/jpeg"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", type=int, default=1, choices=[1, 2, 3])
    v = ap.parse_args().variant
    if os.path.basename(WORK) != "fake":
        sys.exit("가짜 명부 폴더 이름이 이상하다 — 멈춘다")
    shutil.rmtree(WORK, ignore_errors=True)
    folder = os.path.join(WORK, "photos")
    os.makedirs(folder)
    ids = list(range(1, 101))
    if v == 2:
        ids = [i for i in ids if i > 3] + [101, 102]
    if v == 3:
        ids = [i for i in ids if i > 10]
    people, photos = [], {}
    for i in ids:
        r = person(i)
        if v == 2 and 10 <= i <= 14:
            r["position"], r["position_detail"] = "장로", "시무장로"
        people.append(r)
        if i % 3 == 0:
            color = (200, 60, 60) if (v == 2 and i == 21) else ((i * 37) % 256, (i * 91) % 256, (i * 53) % 256)
            photos[str(900000 + i)] = photo(900000 + i, color, folder)
        else:
            photos[str(900000 + i)] = None
    meta = {"source_date": datetime.date.today().isoformat(), "fake": True, "source_file": f"fake-v{v}", "count": len(people)}
    with open(os.path.join(WORK, "people.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "people": people}, f, ensure_ascii=False)
    with open(os.path.join(WORK, "photos.json"), "w", encoding="utf-8") as f:
        json.dump(photos, f)
    print(f"가짜 명부 {v}판 — {len(people)}명 · 사진 {sum(1 for x in photos.values() if x)}장 → {WORK}")


if __name__ == "__main__":
    main()
