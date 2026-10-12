# Edge Function 배포 가드 (2026-10-12)

`church-admin` 함수는 **`tools/deploy-fn.py` 로만** 올린다. 형제 저장소 성경암송(`bible-memorize-church-app-v2`)의
`tools/deploy-fn.py` · `docs/notes/backend-api.md` 「배포 가드」 절을 그대로 옮겨 이 저장소에 맞췄다.
판단 함수 시험은 `python tests/deploy-fn-guard.py` — `python tools/preflight.py` [5] 가 함께 돌린다(준비물 없음).

## 쓰는 법
```bash
python tools/deploy-fn.py church-admin --dev                  # 1) 개발 — origin/main 과 같은 판
python tools/deploy-fn.py church-admin --dev --allow-ahead    #    개발 — main 에 아직 없는 내 가지를 시험할 때
python tools/deploy-fn.py church-admin --prod                 # 2) localhost:8000 확인 뒤 운영 — origin/main 과 같아야만
python tools/deploy-fn.py church-admin --prod --dry-run       #    검사만, 배포 명령은 찍기만
```
- 어느 폴더에서 불러도 된다 — 스크립트가 제 자리(`tools/` 의 부모)를 저장소 뿌리로 잡고, 거기서
  `supabase functions deploy church-admin --no-verify-jwt --project-ref <ref> --workdir <저장소 뿌리>` 를 부른다.
  worktree 에서 부르면 **그 worktree** 의 파일이 나간다(찍히는 「작업 트리」 줄로 확인).
- `supabase link` 는 하지 않는다 — `--project-ref` 가 대상을 고른다. **저장소 루트 link 금지** 규칙 그대로이고,
  SQL 용 작업 폴더 `~/.church-admin/supa-dev`·`supa-prod` 에는 함수 소스가 없으니 거기서 deploy 하지 않는다.
- 대상: `--dev` = `ktpwthwqzgcqcrmsafdo` · `--prod` = `xnomlgydifiqiybervtf`(admin.onlybible.kr). 운영은 배포 직전에 ref 와 「운영」을 크게 찍는다 — 입력 확인은 없다(`--prod` 플래그가 곧 확인이다).
- 끝에 배포 뒤 할 일을 찍는다 — 개발: `tests/server.dev.test.mjs`(+ 고친 묶음의 `*.dev.test.mjs`) · localhost:8000 화면.
  운영: 운영에 대고 도는 시험은 없다 — 살아 있나 `curl -X POST …/functions/v1/church-admin` → `unauthenticated` · admin.onlybible.kr 에서 고친 메뉴를 「이번 판에만 있는 표식」으로.

## 무엇을 보나
`git fetch origin` 뒤, 올라갈 경로 — `supabase/functions/church-admin/`(파일 20여 개를 상대 import 로 묶는다 · 바깥 `../_shared` 가 생기면 import 를 따라가 함께 본다) + `supabase/config.toml`(verify_jwt) — 를 보고, 하나라도 걸리면 **배포하지 않고 종료코드 1**:

| 걸리는 것 | 개발 | 개발 `--allow-ahead` | 운영 |
|---|---|---|---|
| 커밋 안 된 변경·추적 안 된 파일 | 막음 | 막음 | 막음 |
| origin/main 보다 **뒤처짐**(main 이 그 경로에 넣은 커밋이 HEAD 에 없다) | 막음 | 막음 | 막음 |
| origin/main 과 내용이 다름(**앞섬**) | 막음 | 경고 | 막음 |
| origin/main 에 있는 **액션이 빠짐** | 막음 | 경고(뒤처지지 않았을 때만) | 막음 |
| 로컬 판 안에서 문과 갈래가 어긋남 | 경고 | 경고 | 경고 |

**액션 세기 — 두 곳을 따로 origin/main 과 견준다.** 이 함수의 라우팅은 두 겹이다:
- 갈래 = `index.ts` 의 `switch (action)` 둘(토큰 갈래 · 내부 키 갈래 `internalRoute`)의 `case "이름":`.
  한 줄에 여럿 쓴다(성경암송 api 프록시 묶음 `case "stats": case "participants": …`) — 그래서 **`case` 로 시작하는 줄**에서 모두 줍는다.
- 문 = `authz.ts` 의 `ACTION_ROLES` 열쇠(한 줄에 여럿도 · `//` 주석은 버린다).
- 어느 쪽이든 main 에만 있는 이름이 있으면 「빠지는 것」으로 이름을 찍고 막는다. 로컬에서 하나도 못 세면(꼴이 바뀌었다) 배포 전에 멈춘다 — 그때는 가드를 고친다.
- 로컬 판 안의 어긋남(문만 있고 갈래가 없다 · 갈래만 있고 문이 없다 · 내부 키 `internal…` 셋은 일부러 문이 없으니 뺀다)은 **경고만** — 둘 다 닫히는 쪽(unknown-action)으로 틀리기 때문이다. 새 액션은 「⚠️ 함정」대로 `ACTION_ROLES` + case + `tests/server.dev.test.mjs` `PROBE` 셋을 함께.
  (2026-10-12 기준 갈래 201 = 문 198 + 내부 3 · 어긋남 0 — `tests/deploy-fn-guard.py` 의 진짜 파일 시험이 지킨다.)

## 왜
`supabase functions deploy` 는 git 이 아니라 **작업 트리의 파일을 통째로** 올린다. 여러 세션이 같은 체크아웃에서 일하므로
1. 남의 **커밋 안 된** 코드가 내 배포에 실려 운영으로 나가고,
2. **낡은 체크아웃**에서 배포하면 남이 main 에 넣은 액션이 운영에서 **오류 없이 사라진다** — 화면은 그 메뉴에서 unknown-action 을 받는다.
   (성경암송에서 봉사 당번·교육 액션이 그렇게 빠질 뻔했고, 가을 이벤트 `perDay` 가 조용히 1 로 돌아간 일이 있었다.)
3. main 에 안 들어간 가지를 운영에 올리면, 다음에 main 에서 배포하는 세션이 그것을 **조용히 지운다** — 그래서 운영은 main 과 같은 판만.

## ⚠️ 우회 금지
걸렸다고 `supabase functions deploy` 를 손으로 치지 말 것 — 위 사고를 그대로 밟는다. 걸린 까닭을 고치고 다시 돌린다:
- 커밋 안 된 것 → 내 것이면 가지에 커밋(WIP 도 된다) · 남의 것이면 그 세션이 끝낼 때까지. 공유 체크아웃이 어지러우면 `git worktree add … origin/main` 에서.
- 뒤처짐 → `git merge origin/main`(또는 rebase).
- 운영인데 main 과 다름 → main 에 넣은 뒤 main(또는 같아진 worktree)에서.
- 급히 되돌릴 때도 되돌리는 커밋을 main 에 넣은 뒤 이것으로 올린다.

가드 자체를 고칠 때는 판단을 순수 함수(`judge`·`case_actions`·`role_keys`·`route_gaps`·`relative_imports`·`parse_porcelain`)에 두고 `tests/deploy-fn-guard.py` 에 경우를 더한다. 실제 deploy 로 시험하지 말고 `--dry-run` 으로(통과·거절 둘 다).
