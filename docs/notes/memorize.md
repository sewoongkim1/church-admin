# 성경암송 메뉴(교회 어드민 · 역할 memorizeadmin)

> 성경암송 앱(gocheok.onlybible.kr)의 옛 관리자 화면(`admin-stats.html` 등)에서 옮겨 온 메뉴들. 서버는 거의 다 **성경암송 api 를 내부 키로 중계**한다(`index.ts` `memProxy` · `authz.ts` `ACTION_ROLES`).
> 옮긴 차례·남은 것은 성경암송 저장소 `docs/notes/admin-migration.md` · `docs/backlog.md` 4-5.

## 메뉴(`js/menus/memorize/`)
| 메뉴 | 파일 | 중계하는 api 액션 |
|---|---|---|
| 📊 통계 — 기간별 · 구절별 · 도전 · 축복 기도문(2026-10-13 탭 넷) | `stats.js` · `stats-logic.js` | stats · verses · ranking · blessingUsage · getVerses(말씀 이름) |
| 🚩 게시판 관리 — 글 목록 · 📢 공지 쓰기(사진 넉 장까지 · 2026-10-31) · 관리자 답글 · 🚩 신고 · AI답 신고 | `board.js` · `board-logic.js` | boardList · boardModerate · boardPost · boardUpload · boardReply · boardReports · boardReportResolve · sermonAnswerReports · sermonAnswerReportResolve |
| ⚙️ 앱 설정·문구 | `config.js` | getConfig · saveConfig |
| 📜 내 안에 거하는 말씀(2026-10-13) | `passages.js` · `passages-logic.js` | getPassages · savePassage · deletePassage · getConfig/saveConfig(`passagesPublic`) |
| ✍️ 필사 명단 · 💬 말씀 질문 기록 · 📣 알림 현황 · 🩺 시스템 상태 | `pilsa.js` · `chatlog.js` · `push.js` · `monitor.js` · `status-format.js` | pilsa* · sermonChatLog 등 · push* · monitor |

## ⚠️ 함정(2026-10-13 운영 확인에서 찾은 것)
- **신고 까닭은 `{ 까닭코드: 건수 }` 객체다**(api `boardReportGroup` · `sermonReportGroup`). 배열로 알고 `.map` 하면 신고가 한 건이라도 있는 순간 탭이 「불러오는 중…」에서 멈춘다 — `board.js` `reasonText` 한 곳을 쓴다. 게시판 신고의 글 내용 칸은 `excerpt`(content 아님).
- **push_log 의 시각 칸은 `sent_at`**(created_at 없음) — `status-format.js` `pushWhen`. 발송 종류(mode)는 `PUSH_MODE` 에서 한글로(봉사 당번은 api 가 `duty-` + 종류 · 교육 `edu-`). 새 종류를 만들면 한 줄 더한다(모르는 것은 영어 그대로 보인다).
- **`passagesPublic` 은 📜 메뉴에서만 켜고 끈다** — ⚙️ 앱 설정·문구(JSON 편집)에서 `"false"` 를 따옴표째 적으면 글자로 저장되고 성도님 앱은 글자가 있으면 「켜짐」으로 읽는다. 그래서 앱 설정 목록에서 뺐다.
- 📜 「목록에 보이기」를 끈 본문은 `getPassages` 가 돌려주지 않아 **여기서 되살릴 길이 없다**(끌 때 경고 창). 미리 보기 주소 `?passages=1` 은 공개를 꺼도 열린다.
- **📢 공지 사진(2026-10-31)** — 공지 HTML 은 `<img>` 를 떼므로(성경암송 `boardRich`) 그림은 **사진 칸으로만** 붙는다(글 아래 · 고른 차례). 고를 때 이 기기에서 캔버스로 다시 그려 줄이고(`board.js` `shrinkPhoto` — 성경암송 `app.js` `shrinkImage` 와 같은 차례 · 긴 변만 1600px(앱 1080 — 세로 책 쪽이 폭 762px 로 흐렸다) · 사진 속 정보(EXIF·GPS)가 빠진다) 「올리기」를 누른 뒤에야 `boardUpload` 로 한 장씩 → `boardPost` 의 `images`(이름만). 하나라도 안 되면 글을 올리지 않는다(올라간 사진은 api 가 하루 뒤 치운다). ⚠️ 크기 상한(`PHOTO_TARGET` ≈300KB)을 올리지 말 것 — 한 장이 1MB 를 넘으면 폰 업로드가 끊긴다(성경암송 앱). ⚠️ api 쪽 `INTERNAL_ADMIN_OK` 에 `boardUpload` 가 있어야 한다(없으면 「관리자 글로 받지 않았어요 (unauthorized)」). `boardUpload` 는 「바꾼 기록」에 따로 남기지 않는다(`MEM_WRITE` 밖 — 글이 남는다).
- 📢 공지·관리자 답글은 내부 키 길이라 api 가 관리자로 본다(공지의 HTML `rich` 도 관리자 글에만). 답글 본문에 `id`(글 번호)를 함께 싣는다 — 「바꾼 기록」 대상 칸 몫(api 는 읽지 않는다).
- 쓰기(공지·답글·본문 저장·지우기)는 **개발 DB(localhost:8000)에서만** 시험한다 — 운영에서 누르면 성도님 게시판·앱에 그대로 나간다.
- 아직 `<select>`·`type="date"` 를 쓰는 옛 화면: `config.js` · `pilsa.js` · `sermon.js`(규칙 위반 · 고칠 때 `picker.js` 로).
