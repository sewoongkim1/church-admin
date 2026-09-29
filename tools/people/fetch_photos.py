# -*- coding: utf-8 -*-
"""교인명부 ② 사진 받기 (2026-09-29)

  python tools/people/fetch_photos.py --date 2026-09-29 [--seed "C:/Projects/교인사진_2026_09_29"]

photo_urls.json 의 주소에서 사진을 받아 <작업 폴더>/photos/<교인ID>.jpg 로 둔다(이어 받기 — 이미 있으면 건너뜀).
--seed 폴더에 같은 이름 파일이 있으면 받지 않고 복사한다(2026-09-29 에 받아 둔 것 · 기본 그림 하위 폴더까지 본다).
끝나면 dimode 기본 그림(「사진 없음」)을 골라 photos.json 을 쓴다: { "<교인ID>": {"hash","mime"} | null }
⚠️ dimode 서버에 부담이 가지 않게 동시에 3장 · 한 장마다 0.15초 쉰다.
⚠️ 하나라도 못 받으면 photos.json 을 쓰지 않는다 — 다시 돌리면 못 받은 것만 받는다.
"""
import argparse, collections, hashlib, json, os, shutil, sys, threading, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8")
WORK_ROOT = r"C:\Projects\교인명부_작업"
SEED_SUB = "_사진없음(기본그림)"
# dimode 기본 그림(회색 바탕 흰 사람 모양) — 2026-09-29 확인. 같은 그림이 100장 넘게 나와도 기본 그림으로 본다.
KNOWN_PLACEHOLDERS = {"cb677f32be4ed3a756afaec1c16b5edd"}
PLACEHOLDER_MIN = 100


def mime_of(b):
    if b[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if b[:4] == b"GIF8":
        return "image/gif"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--seed", default="")
    a = ap.parse_args()
    work = os.path.join(WORK_ROOT, a.date)
    out = os.path.join(work, "photos")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(work, "photo_urls.json"), encoding="utf-8") as f:
        urls = json.load(f)
    lock, st, fails = threading.Lock(), collections.Counter(), []

    def get(item):
        pid, url = item
        dst = os.path.join(out, f"{pid}.jpg")
        if os.path.exists(dst) and os.path.getsize(dst) > 0:
            with lock:
                st["skip"] += 1
            return
        if a.seed:
            for src in (os.path.join(a.seed, f"{pid}.jpg"), os.path.join(a.seed, SEED_SUB, f"{pid}.jpg")):
                if os.path.exists(src):
                    shutil.copyfile(src, dst)
                    with lock:
                        st["seed"] += 1
                    return
        last = ""
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    b = r.read()
                if not mime_of(b):
                    last = f"그림 아님({len(b)}B)"
                    break
                tmp = dst + ".part"
                with open(tmp, "wb") as f:
                    f.write(b)
                os.replace(tmp, dst)
                with lock:
                    st["ok"] += 1
                time.sleep(0.15)
                return
            except Exception as ex:
                last = type(ex).__name__
                time.sleep(2 * (attempt + 1))
        with lock:
            fails.append(f"{pid}\t{last}")

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=3) as ex:
        for i, _ in enumerate(ex.map(get, urls.items()), 1):
            if i % 500 == 0:
                print(f"{i}/{len(urls)} 받음 {st['ok']} 복사 {st['seed']} 건너뜀 {st['skip']} 실패 {len(fails)} · {time.time() - t0:.0f}초", flush=True)
    print(f"끝: 받음 {st['ok']} · 복사 {st['seed']} · 건너뜀 {st['skip']} · 실패 {len(fails)}")
    if fails:
        with open(os.path.join(work, "photo_fails.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(fails))
        sys.exit("못 받은 사진이 있다 — photo_fails.txt · 다시 돌리면 그것만 받는다")
    info = {}
    for pid in urls:
        with open(os.path.join(out, f"{pid}.jpg"), "rb") as f:
            b = f.read()
        info[pid] = {"hash": hashlib.md5(b).hexdigest(), "mime": mime_of(b) or "image/jpeg"}
    cnt = collections.Counter(v["hash"] for v in info.values())
    ph = KNOWN_PLACEHOLDERS | {h for h, n in cnt.items() if n >= PLACEHOLDER_MIN}
    photos = {pid: (None if v["hash"] in ph else v) for pid, v in info.items()}
    with open(os.path.join(work, "photos.json"), "w", encoding="utf-8") as f:
        json.dump(photos, f)
    real = sum(1 for v in photos.values() if v)
    print(f"실제 사진 {real} · 기본 그림 {len(photos) - real}")


if __name__ == "__main__":
    main()
