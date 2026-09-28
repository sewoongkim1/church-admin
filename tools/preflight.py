# -*- coding: utf-8 -*-
"""배포 전 점검 — Actions 가 배포 전에 돌리고, 여기서 실패하면 배포가 안 된다. 손으로도: python tools/preflight.py

⚠️ 준비물(npm 꾸러미·비밀 키·네트워크)이 필요한 검사는 넣지 않는다.
   tests/*.dev.test.mjs(개발 서버에 대고 도는 시험)는 이름에 .dev. 가 있어 여기서 빠진다.
"""
import glob, os, subprocess, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fail = []

def run(title, cmd):
    r = subprocess.run(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode == 0:
        print("  통과  " + title)
    else:
        fail.append(title)
        print("  실패  " + title + "\n" + r.stdout.decode("utf-8", "replace").rstrip())

print("\n[1] 자바스크립트 문법 (node --check)")
for f in sorted(glob.glob(os.path.join(ROOT, "js", "**", "*.js"), recursive=True)):
    run(os.path.relpath(f, ROOT).replace("\\", "/"), ["node", "--check", f])

print("\n[2] 순수 함수 시험 (node --test)")
tests = sorted(p for p in glob.glob(os.path.join(ROOT, "tests", "*.test.mjs")) if ".dev." not in os.path.basename(p))
run("시험 파일 %d개" % len(tests), ["node", "--experimental-strip-types", "--test", *tests])

print("\n[3] 캐시 표식 (stamp --check)")
run("stamp", [sys.executable, os.path.join("tools", "stamp.py"), "--check"])

print()
if fail:
    print("실패 %d건 — 배포하지 않는다" % len(fail))
    sys.exit(1)
print("모두 통과")
