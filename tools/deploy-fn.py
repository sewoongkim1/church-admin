# -*- coding: utf-8 -*-
"""Edge Function 배포 가드 — 남의 미완성 코드나 낡은 체크아웃이 운영으로 나가는 것을 막는다.

    python tools/deploy-fn.py church-admin --dev                  개발(ktpwthwqzgcqcrmsafdo)
    python tools/deploy-fn.py church-admin --dev --allow-ahead    개발 — main 에 아직 없는 내 가지를 시험할 때
    python tools/deploy-fn.py church-admin --prod                 운영(xnomlgydifiqiybervtf · admin.onlybible.kr)
    python tools/deploy-fn.py church-admin --prod --dry-run       검사만 하고 배포 명령은 찍기만

형제 저장소 성경암송(bible-memorize-church-app-v2)의 tools/deploy-fn.py 를 옮겨 맞췄다(2026-10-12).
읽을 것 docs/notes/deploy-guard.md.

왜 필요한가:
  `supabase functions deploy` 는 git 이 아니라 **작업 트리의 파일을 통째로** 올린다.
  church-admin 은 파일 20여 개를 상대 import 로 묶으므로, 그 가운데 하나만 남의 미완성 판이어도 함께 나간다.
    (1) 남의 **커밋 안 된** 코드가 내 배포에 실려 운영으로 나가고,
    (2) **낡은 체크아웃**에서 배포하면 남이 이미 main 에 넣은 액션이 운영에서 **오류 없이 사라진다**
        (화면은 unknown-action 400 을 받는다 — 성경암송에서 봉사 당번·교육 액션이 그렇게 빠질 뻔했다).
  그래서 배포 직전에 `git fetch origin` 을 하고, 올라갈 파일이 깨끗한지·origin/main 과 같은지를 본다.
  하나라도 걸리면 배포하지 않고 종료코드 1.

규칙: 개발 먼저 → localhost:8000 확인 → 운영. `--no-verify-jwt` 는 이 스크립트가 늘 붙인다
(토큰 검사는 index.ts 가 요청마다 한다 — supabase/config.toml 의 verify_jwt=false 와 같은 뜻).
CLI 는 저장소 뿌리를 `--workdir` 로 주고 `--project-ref` 로 대상을 고른다 — `supabase link` 는 하지 않는다
(저장소 루트 link 금지 · SQL 용 ~/.church-admin/supa-dev·supa-prod 에는 함수 소스가 없어 거기서 부르면 안 된다).
⚠️ 이 검사를 피하려고 `supabase functions deploy` 를 손으로 치지 말 것 — 걸렸다면 걸린 까닭을 고친다.

파이썬 표준 라이브러리만 쓴다(preflight.py 와 같은 결 — 준비물 없이 어디서나 돈다).
판단은 아래 순수 함수(`parse_porcelain`·`case_actions`·`role_keys`·`route_gaps`·`relative_imports`·`judge`)에
모아 두었다 — 시험은 tests/deploy-fn-guard.py(preflight [5] 가 부른다).
"""
import argparse, glob, os, posixpath, re, shutil, subprocess, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FN_DIR = "supabase/functions"
CONFIG = "supabase/config.toml"          # verify_jwt 등 함수 설정 — 함께 나가는 것으로 보고 같은 검사를 건다
MAIN = "origin/main"

PROJECTS = {
    "dev":  ("ktpwthwqzgcqcrmsafdo", "개발"),
    "prod": ("xnomlgydifiqiybervtf", "운영"),
}


# ── 순수 함수(시험 대상) ─────────────────────────────────────────────
def parse_porcelain(out):
    """`git status --porcelain=v1 -z` 출력 → [(상태 두 글자, 경로)]. 이름 바꾸기의 옛 경로는 버린다."""
    items, parts, i = [], out.split("\0"), 0
    while i < len(parts):
        p = parts[i]
        i += 1
        if len(p) < 4:
            continue
        st, path = p[:2], p[3:]
        if "R" in st or "C" in st:
            i += 1                              # -z 에서는 옛 경로가 다음 칸에 따로 온다
        items.append((st, path))
    return items


_CASE = re.compile(r'\bcase\s+"([A-Za-z0-9_]+)"\s*:')

def case_actions(src):
    """index.ts 본문 → `case "이름":` 의 이름 집합.

    church-admin 은 한 줄에 case 를 여럿 쓴다(성경암송 api 프록시 묶음 — `case "stats": case "participants": …`).
    그래서 **case 로 시작하는 줄**(앞 칸 빼고)에서 모두 줍는다 — 문자열 안의 「case "x":」 는 줄 머리가 아니라 안 센다.
    두 갈래(토큰 갈래 switch · 내부 키 갈래 internalRoute 의 switch)를 함께 센다.
    """
    out = set()
    for line in (src or "").splitlines():
        if line.lstrip().startswith("case "):
            out |= set(_CASE.findall(line))
    return out


_ROLES_BLOCK = re.compile(r'export\s+const\s+ACTION_ROLES\b[^=]*=\s*\{(.*?)\n\};', re.S)
_ROLE_KEY = re.compile(r'(?:^|,)\s*["\']?([A-Za-z_$][\w$]*)["\']?\s*:')

def role_keys(src):
    """authz.ts 본문 → `ACTION_ROLES` 의 열쇠(액션 이름) 집합. 못 찾으면 빈 집합.

    한 줄에 여럿(`stats: "memorizeadmin", participants: "memorizeadmin",`)도 센다. `//` 뒤 주석은 버린다.
    값은 문자열·배열·이름(DUTY_BOTH)·null 뿐이라 값 안에 「이름:」 꼴이 없다.
    """
    m = _ROLES_BLOCK.search(src or "")
    if not m:
        return set()
    keys = set()
    for line in m.group(1).splitlines():
        keys |= set(_ROLE_KEY.findall(re.sub(r"//.*", "", line)))
    return keys


def route_gaps(roles, cases):
    """로컬 판 안에서 문(ACTION_ROLES)과 갈래(case)가 어긋난 것 → (문만 있는 것, 갈래만 있는 것).

    내부 키 갈래(internal…)는 일부러 ACTION_ROLES 에 없다(CLAUDE.md 「⚠️ 함정」) — 빼고 센다.
    둘 다 닫히는 쪽으로 틀린다(문만 = 갈래 끝의 unknown-action · 갈래만 = canCall 의 unknown-action)라 막지는 않고 경고한다.
    """
    return sorted(roles - cases), sorted(c for c in cases - roles if not c.startswith("internal"))


_IMPORT = re.compile(r'''(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}/[^"']+)["']''')

def relative_imports(src, file_path):
    """한 파일의 상대 import(./x.ts · ../_shared/y.ts) → 저장소 기준 경로 목록(posix)."""
    base = posixpath.dirname(file_path)
    return sorted({posixpath.normpath(posixpath.join(base, m)) for m in _IMPORT.findall(src or "")})


def judge(env, dirty, diff_files, behind, missing_actions, allow_ahead, gaps=None):
    """배포해도 되는가 → (ok, [(등급, 말)]). 등급은 "막음"·"경고"·"통과".

    env             "dev" | "prod"
    dirty           [(상태, 경로)] — 올라갈 경로 아래 커밋 안 된 변경·추적 안 된 파일
    diff_files      [경로] — 작업 트리와 origin/main 이 다른 파일(커밋은 됐어도 main 과 다른 것)
    behind          [커밋 한 줄] — origin/main 에는 있고 HEAD 에는 없는, 그 경로를 고친 커밋
    missing_actions [이름] — origin/main 에는 있는데 로컬에는 없는 액션(index.ts case 나 authz.ts ACTION_ROLES)
    allow_ahead     --allow-ahead 를 줬나
    gaps            (문만 [이름], 갈래만 [이름]) — 로컬 판 안의 어긋남(route_gaps). 경고만.
    """
    msgs, ok = [], True

    # ① 커밋 안 된 것 — 개발이든 운영이든 막는다.
    #    deploy 는 작업 트리를 올리므로 그 변경이 내 것인지 남의 것인지 이 스크립트는 알 수 없다.
    #    내 것이면 가지에 커밋(WIP 커밋도 된다)한 뒤 다시 돌리면 된다 — 그 한 번이 남의 미완성 코드를 막는다.
    if dirty:
        ok = False
        lines = "\n".join("        %s  %s" % (st, p) for st, p in dirty)
        msgs.append(("막음", "커밋 안 된 변경·추적 안 된 파일이 있다 — deploy 는 작업 트리를 통째로 올리므로 "
                              "이것이 그대로 나간다(남의 미완성 코드일 수도 있다).\n%s\n"
                              "        → 내 것이면 가지에 커밋하고, 남의 것이면 그 세션이 끝낼 때까지 기다린다" % lines))

    # ② origin/main 이 이 경로에 넣은 커밋이 HEAD 에 없다 = 낡은 체크아웃.
    #    개발에서도 막는다 — 옛 판을 개발에 올리면 그 위에서 확인한 것이 운영(main 이 다 들어간 판)에서
    #    같다는 보장이 없고, 개발 DB 를 쓰는 다른 세션의 액션도 지운다.
    #    --allow-ahead 로도 못 푼다 — 「앞섬」은 허용하지만 「뒤처짐」은 git merge origin/main 으로 푼다.
    #    (「뒤처짐」은 HEAD 기준으로 센다 — 작업 트리가 깨끗해야 ① 을 지나므로 HEAD 가 곧 올라갈 판이다.)
    if behind:
        ok = False
        lines = "\n".join("        " + c for c in behind)
        msgs.append(("막음", "이 체크아웃이 origin/main 보다 뒤처졌다 — main 에 들어간 아래 커밋이 빠진 채 나간다"
                              "(남의 액션이 오류 없이 사라진다).\n%s\n"
                              "        → git merge origin/main(또는 rebase) 뒤 다시" % lines))

    # 빠지는 액션 — 뒤처져서 빠진 것이면 위 ② 가 이미 막았다. 뒤처지지 않았는데도 빠진다면
    # 내 가지가 일부러 지운 것이다: 개발 + --allow-ahead 에서만 경고로 지나가고, 그 밖에는 막는다.
    if missing_actions:
        names = ", ".join(sorted(missing_actions))
        if env == "dev" and allow_ahead and not behind:
            msgs.append(("경고", "origin/main 에 있는 액션 %d개가 로컬(index.ts case · authz.ts ACTION_ROLES)에 없다: %s\n"
                                  "        → 내 가지가 일부러 지운 것인지 확인할 것" % (len(missing_actions), names)))
        else:
            ok = False
            msgs.append(("막음", "origin/main 에 있는 액션 %d개가 로컬(index.ts case · authz.ts ACTION_ROLES)에 없다: %s"
                         % (len(missing_actions), names)))

    # ③ main 과 내용이 다르다(뒤처진 것이 아니라 내가 앞선 경우만 여기까지 온다).
    #    운영: 반드시 main 과 같아야 한다 — 운영에 나가는 것은 main 에 들어간 판뿐이다.
    #          (main 에 안 들어간 가지를 운영에 올리면, 다음에 main 에서 배포하는 세션이 그것을 조용히 지운다.)
    #    개발: 아직 main 에 안 들어간 내 가지를 시험하는 것이 개발 DB 의 쓸모다 — 다만 기본은 막고
    #          --allow-ahead 를 손으로 줄 때만 지나간다(「앞서 있음」을 알고 올리는 것이 확인이다).
    if diff_files and not behind:               # 뒤처졌으면 다른 까닭은 이미 ② 가 말했다
        lines = "\n".join("        " + p for p in diff_files)
        if env == "prod":
            ok = False
            msgs.append(("막음", "origin/main 과 내용이 다르다 — 운영에는 main 의 판만 올린다.\n%s\n"
                                  "        → main 에 넣은 뒤(또는 git merge origin/main 해 같아진 뒤) 다시" % lines))
        elif allow_ahead:
            msgs.append(("경고", "origin/main 과 다르지만 --allow-ahead 로 개발에 올린다(main 에 아직 없는 내 가지).\n%s" % lines))
        else:
            ok = False
            msgs.append(("막음", "origin/main 과 내용이 다르다.\n%s\n"
                                  "        → main 에 아직 안 들어간 내 가지를 개발에서 시험하는 것이면 --allow-ahead 를 붙인다" % lines))

    # 로컬 판 안의 어긋남 — 새 액션은 ACTION_ROLES + case + PROBE 셋이 함께여야 한다(CLAUDE.md 「⚠️ 함정」).
    if gaps and (gaps[0] or gaps[1]):
        only_role, only_case = gaps
        parts = []
        if only_role:
            parts.append("ACTION_ROLES 에만 있고 case 가 없다(불러도 unknown-action): " + ", ".join(only_role))
        if only_case:
            parts.append("case 만 있고 ACTION_ROLES 에 없다(canCall 이 unknown-action): " + ", ".join(only_case))
        msgs.append(("경고", "\n        ".join(parts) + "\n        → 일부러가 아니면 authz.ts·index.ts·tests/server.dev.test.mjs PROBE 를 맞출 것"))

    if ok and not msgs:
        msgs.append(("통과", "커밋 안 된 것 없음 · origin/main 과 같음 · 액션 같음"))
    return ok, msgs


# ── git·파일 ─────────────────────────────────────────────────────────
def git(*args, check=True):
    r = subprocess.run(["git", *args], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out = r.stdout.decode("utf-8", "replace")
    if check and r.returncode != 0:
        raise RuntimeError("git %s 실패: %s" % (" ".join(args), r.stderr.decode("utf-8", "replace").strip()))
    return out, r.returncode


def read_local(path):
    try:
        with open(os.path.join(ROOT, path), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def read_main(path):
    out, rc = git("show", "%s:%s" % (MAIN, path), check=False)
    return out if rc == 0 else None


def deploy_paths(name):
    """올라갈 경로 — 함수 폴더 + 그 폴더의 .ts 가 상대 import 로 끌어오는 바깥 파일(_shared 류) + config.toml."""
    fdir = "%s/%s" % (FN_DIR, name)
    paths, seen = [fdir + "/"], set()
    todo = []
    for dp, _, fs in os.walk(os.path.join(ROOT, fdir)):
        for f in fs:
            if f.endswith((".ts", ".tsx", ".js", ".mjs")):
                todo.append(os.path.relpath(os.path.join(dp, f), ROOT).replace("\\", "/"))
    while todo:
        p = todo.pop()
        if p in seen:
            continue
        seen.add(p)
        for dep in relative_imports(read_local(p), p):
            if not dep.startswith(fdir + "/") and dep not in paths:
                paths.append(dep)
            todo.append(dep)
    if os.path.exists(os.path.join(ROOT, CONFIG)):
        paths.append(CONFIG)
    return paths


def main():
    funcs = sorted(d for d in os.listdir(os.path.join(ROOT, FN_DIR))
                   if os.path.isdir(os.path.join(ROOT, FN_DIR, d)) and not d.startswith((".", "_")))
    ap = argparse.ArgumentParser(description="Edge Function 배포 가드")
    ap.add_argument("name", help="함수 이름(%s)" % " · ".join(funcs))
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dev", action="store_true", help="개발 프로젝트로")
    g.add_argument("--prod", action="store_true", help="운영 프로젝트로(이 플래그가 곧 확인이다)")
    ap.add_argument("--allow-ahead", action="store_true", help="개발에서만 — origin/main 보다 앞선 내 가지를 올린다")
    ap.add_argument("--dry-run", action="store_true", help="검사만 하고 배포 명령은 찍기만")
    a = ap.parse_args()

    env = "prod" if a.prod else "dev"
    ref, label = PROJECTS[env]
    if a.name not in funcs:
        print("✗ 함수 「%s」 는 %s/ 아래에 없다 — 있는 것: %s" % (a.name, FN_DIR, ", ".join(funcs)))
        return 1
    if a.allow_ahead and env == "prod":
        print("✗ --allow-ahead 는 개발에서만 쓴다 — 운영에는 origin/main 의 판만 올린다")
        return 1

    print("\n[배포 가드] %s → %s(%s)%s" % (a.name, label, ref, "  · dry-run" if a.dry_run else ""))

    _, rc = git("fetch", "origin", "--quiet", check=False)
    if rc != 0:
        print("✗ git fetch origin 이 실패했다 — origin/main 을 모르는 채로는 배포하지 않는다")
        return 1
    head = git("rev-parse", "--short", "HEAD")[0].strip()
    mainrev = git("rev-parse", "--short", MAIN)[0].strip()
    branch = git("branch", "--show-current")[0].strip() or "(분리된 HEAD)"
    print("  가지 %s @ %s · %s @ %s" % (branch, head, MAIN, mainrev))
    print("  작업 트리 " + ROOT)

    paths = deploy_paths(a.name)
    print("  올라갈 경로: " + " · ".join(paths))

    idx = "%s/%s/index.ts" % (FN_DIR, a.name)
    authz = "%s/%s/authz.ts" % (FN_DIR, a.name)
    if read_main(idx) is None:
        print("  (origin/main 에는 이 함수가 아직 없다)")

    st_out, _ = git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--", *paths)
    dirty = parse_porcelain(st_out)
    diff_out, _ = git("diff", "--name-only", MAIN, "--", *paths)
    diff_files = [l for l in diff_out.splitlines() if l.strip()]
    beh_out, _ = git("log", "--oneline", "HEAD.." + MAIN, "--", *paths)
    behind = [l for l in beh_out.splitlines() if l.strip()]

    # 액션 세기 — 갈래(index.ts case)와 문(authz.ts ACTION_ROLES)을 따로 origin/main 과 견준다.
    loc_c, mn_c = case_actions(read_local(idx)), case_actions(read_main(idx))
    loc_r, mn_r = role_keys(read_local(authz)), role_keys(read_main(authz))
    if not loc_c:
        print("✗ 로컬 %s 에서 case 를 하나도 못 셌다 — 라우팅 꼴이 바뀌었으면 이 가드(case_actions)를 먼저 고칠 것" % idx)
        return 1
    if os.path.exists(os.path.join(ROOT, authz)) and not loc_r:
        print("✗ 로컬 %s 에서 ACTION_ROLES 를 못 읽었다 — 꼴이 바뀌었으면 이 가드(role_keys)를 먼저 고칠 것" % authz)
        return 1
    miss_c, add_c = sorted(mn_c - loc_c), sorted(loc_c - mn_c)
    miss_r, add_r = sorted(mn_r - loc_r), sorted(loc_r - mn_r)
    print("  갈래(index.ts case) 로컬 %d개 · origin/main %d개" % (len(loc_c), len(mn_c)))
    print("  문(authz.ts ACTION_ROLES) 로컬 %d개 · origin/main %d개" % (len(loc_r), len(mn_r)))
    for title, xs in (("case 빠지는 것(main 에만)", miss_c), ("case 더해지는 것(로컬에만)", add_c),
                      ("ACTION_ROLES 빠지는 것(main 에만)", miss_r), ("ACTION_ROLES 더해지는 것(로컬에만)", add_r)):
        if xs:
            print("    %s: %s" % (title, ", ".join(xs)))
    if not (miss_c or add_c or miss_r or add_r):
        print("    둘 다 같다")
    missing = sorted(set(miss_c) | set(miss_r))
    gaps = route_gaps(loc_r, loc_c) if loc_r else None

    ok, msgs = judge(env, dirty, diff_files, behind, missing, a.allow_ahead, gaps)
    print()
    for lv, m in msgs:
        color = {"막음": "31", "경고": "33", "통과": "32"}[lv]
        print("  \033[%sm%s\033[0m  %s" % (color, lv, m))
    if not ok:
        print("\n✗ 배포하지 않았다(종료코드 1).")
        return 1

    # 저장소 뿌리에서, --workdir 로 그 뿌리를 못 박아 부른다(supabase/config.toml·functions/ 가 거기 있다).
    # link 는 하지 않는다 — --project-ref 가 대상을 고른다(저장소 루트 link 금지 · CLAUDE.md 「배포」).
    cmd = ["supabase", "functions", "deploy", a.name, "--no-verify-jwt", "--project-ref", ref, "--workdir", ROOT]
    print()
    if env == "prod":
        print("  " + "=" * 64)
        print("  ▶▶  운영(%s) 에 「%s」 를 올린다 — admin.onlybible.kr 이 쓰는 서버  ◀◀" % (ref, a.name))
        print("  " + "=" * 64)
    print("  $ " + " ".join('"%s"' % c if " " in c else c for c in cmd))
    if a.dry_run:
        print("\n(dry-run — 위 명령은 실행하지 않았다)")
    else:
        exe = shutil.which("supabase")
        if not exe:
            print("✗ supabase CLI 를 찾지 못했다")
            return 1
        r = subprocess.run([exe] + cmd[1:], cwd=ROOT)
        if r.returncode != 0:
            print("✗ supabase functions deploy 가 실패했다(종료코드 %d)" % r.returncode)
            return r.returncode

    print("\n배포 뒤 할 일:")
    if env == "dev":
        print("  · 개발 서버 시험(네트워크·개발 키 — ~/.church-admin/dev.env):")
        print("      set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types --test tests/server.dev.test.mjs")
        others = sorted(os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "tests", "*.dev.test.mjs"))
                        if not p.endswith("server.dev.test.mjs"))
        if others:
            print("    고친 묶음의 것도(같은 준비로): " + " · ".join("tests/" + o for o in others))
        print("  · localhost:8000(python -m http.server 8000)에서 화면으로 — 「개발 DB」 띠가 떠야 개발이다")
        print("  · 확인이 끝나면 main 에 넣은 뒤: python tools/deploy-fn.py %s --prod" % a.name)
    else:
        print("  · 운영에 대고 도는 시험은 없다(*.dev.test.mjs 는 개발 주소가 아니면 스스로 멈춘다).")
        print("  · 살아 있나: curl -s -X POST https://%s.supabase.co/functions/v1/%s   → {\"ok\":false,\"error\":\"unauthenticated\"}" % (ref, a.name))
        print("  · admin.onlybible.kr 에 로그인해 이번에 고친 메뉴를 한 번 — 「이번 판에만 있는 표식」(새 액션·새 문구)으로 확인")
    return 0


if __name__ == "__main__":
    sys.exit(main())
