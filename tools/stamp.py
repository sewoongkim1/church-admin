# -*- coding: utf-8 -*-
"""배포 직전 index.html 에 파일마다 내용 해시(?v=)를 붙인다 — Actions 안에서만 고쳐 쓰고, 결과는 커밋하지 않는다.

왜: GitHub Pages 는 파일을 10분 캐시한다. 모듈 하나만 옛것이 남으면 새 main.js 가 옛 ui.js 를 불러
「없는 함수」로 화면이 통째로 멈춘다. 파일마다 내용 해시를 붙이면 바뀐 파일만 새로 받는다.
손으로 bump 하지 않으므로 두 사람이 고쳐도 index.html 이 충돌하지 않는다.

    python tools/stamp.py          # index.html 을 고쳐 쓴다(Actions 전용 — 로컬에서 돌렸으면 git checkout index.html)
    python tools/stamp.py --check  # 고쳐 쓰지 않고 표식·파일만 확인(preflight)
"""
import glob, hashlib, json, os, re, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = "<!--IMPORTMAP-->"

def rel(p): return os.path.relpath(p, ROOT).replace("\\", "/")

def digest(p):
    with open(os.path.join(ROOT, p), "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:10]

def build(html):
    if MARK not in html:
        raise SystemExit("index.html 에 %s 표식이 없다" % MARK)
    files = sorted(rel(p) for p in glob.glob(os.path.join(ROOT, "js", "**", "*.js"), recursive=True))
    # 모듈 안의 상대 import("../core/ui.js")도 같은 주소로 풀리므로 이 표에 걸린다
    imports = {"./" + f: "./%s?v=%s" % (f, digest(f)) for f in files}
    html = html.replace(MARK, '<script type="importmap">%s</script>' % json.dumps({"imports": imports}, ensure_ascii=False))
    def tag(m):
        path = m.group(2)
        if not os.path.exists(os.path.join(ROOT, path)):
            raise SystemExit("index.html 이 부르는 파일이 없다: " + path)
        return '%s="%s?v=%s"' % (m.group(1), path, digest(path))
    html = re.sub(r'(href|src)="((?:css|js)/[^"?#]+)"', tag, html)
    return html, files

if __name__ == "__main__":
    p = os.path.join(ROOT, "index.html")
    with open(p, encoding="utf-8") as f:
        out, files = build(f.read())
    if "--check" in sys.argv:
        print("stamp 확인 — 모듈 %d개" % len(files))
        sys.exit(0)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    print("stamp — 모듈 %d개에 해시를 붙였다" % len(files))
