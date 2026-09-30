// 📋 종이 명단 올리기 — 담당자가 종이로 받은 신청을 엑셀·붙여넣기로 한꺼번에 넣는다.
// 성경암송 admin-stats.html 의 renderMinistryPaper 및 부속(mpParse·mpLoadXlsx·mpCell·mpFile·mpReset·mpRun·mpRender)을
// 옮겨 왔다(2026-09-29 · 옛 화면은 얼린 채 둔다). 원문과 지켜야 할 동작 목록: docs/port/ministry-paper-legacy.md 2절·3절.
// 서버 액션 ministryPaperCheck/ministryPaperSave → supabase/functions/church-admin/index.ts 의 ministryPaper
// (순수 헬퍼는 paper.ts). 이 화면은 목록을 불러오지 않는다 — 붙여넣은 글을 서버로 보내고 받은 판정만 보여준다.
//
// ⚠️ 종이는 이미 임명·취소가 정해진 명단이다 — 줄에 상태를 안 적으면 「임명확정」이 기본이다.
// ⚠️ 알림은 가지 않는다 — 임명 알림은 신청 현황 화면에서 한 건씩 누를 때만 나간다.
// ⚠️ 서버가 살펴보기·넣기 둘 다 처음부터 다시 판정한다(index.ts ministryPaper) — 이 화면의 판정은 보여 주기용.
//
// 원문과 달라진 것 —
//   ① 「명단 넣기」를 누르면 **그 순간 다시** textarea 를 읽어(mpParse) 서버로 보낼 rows 를 만들고,
//      확인 창의 상태별 건수도 **같은 그 rows**로 센다(원문 체크리스트 31 — 확인 창이 직전 "살펴보기"
//      결과(mpRows, 캐시)로 세어 텍스트를 고친 뒤와 어긋날 수 있던 구조를 없앴다). 이 건수는 어떤 줄이
//      실제로 반영될지(ok·same 은 서버만 안다)가 아니라 "지금 적힌 대로 무엇을 보내는지"의 미리보기다 —
//      실제 결과는 서버 응답 뒤 카드 목록·위 요약에 나온다.
//   ② 화면 표준 v1(esc·toast·dialog·busy·call, 델리게이트 클릭 한 벌)을 따른다 — 원문의 getPw/getStaff/
//      minAuthLost 는 없다(이 저장소는 pw 를 보내지 않고 로그인 토큰으로 이미 ministry 역할까지 확인됐다 —
//      call() 이 인증이 끊기면 알아서 로그인 화면으로 돌려보낸다). 다시 불러오기도 없다 — 목록을 불러오는
//      화면이 아니라 매번 새로 붙여넣는 화면이라 남겨 둘 명단이 없다.
//   ③ 엑셀 읽기 실패는 원문의 세 갈래 안내 대신 한 가지로 통일했다(사역신청 4·5단계 결정) — 결국
//      "복사해 붙여넣어 주세요"로 돌아가는 안내라 가짓수를 늘릴 실익이 적다.
import { esc, dialog, busy, errorText } from "../../core/ui.js";
import { loadXlsx } from "../../core/xlsx.js";   // SheetJS — 📤 명단 올리기와 같은 한 곳(FE-6 · 2026-09-30)
import { churchBadgeHtml, CHURCH_LEGEND, hasChurch } from "../people/church-badge.js";

const TITLE = `<h2 class="page-title">📋 종이 명단 올리기</h2>`;

// ⚠️ 칸 이름이 아니라 **자리(순서)**로 읽는다 — 양식의 칸 차례를 바꾸면 조용히 어긋난다.
const MP_COLS = ["교구", "목장", "이름", "직분", "휴대폰", "사역팀", "부서(선택)", "하위 선택(선택)",
  "신청일(선택)", "임명일(선택)", "상태(선택)", "사유(취소일 때)"];

// 줄에 적은 상태 — 서버 PAPER_ALIAS(paper.ts)와 같은 표. 여기서는 확인 창 미리보기에만 쓴다 —
// 실제 판정(사역 목록에 있는지·상한·중복 등)은 언제나 서버(ministryPaper)가 처음부터 다시 한다.
const PAPER_ALIAS = {
  "임명": "임명확정", "임명확정": "임명확정", "확정": "임명확정",
  "취소": "취소", "신청": "신청완료", "신청완료": "신청완료",
  "접수": "접수완료", "접수완료": "접수완료",
};
// 담당자 화면이 쓰는 짧은 이름 — 서버 paperName(paper.ts)과 같다
export const paperShort = (st) => st === "임명확정" ? "임명" : st === "신청완료" ? "신청" : st === "접수완료" ? "접수" : st;
// 확인 창 미리보기용 — 비었으면 「임명」(종이는 이미 정해진 명단), 못 알아보는 글자는 그 글자 그대로 보여
// 담당자가 무엇을 잘못 적었는지 알 수 있게 한다(그 줄 자체는 서버가 오류로 되돌려준다).
export const previewStatus = (raw) => {
  const t = String(raw || "").trim();
  if (!t) return "임명";
  const st = PAPER_ALIAS[t];
  return st ? paperShort(st) : t;
};

// 서버 error 는 두 결이다(사역팀 정보 화면 errMsg 와 같은 판단) — 코드 꼴(영문 소문자+하이픈, ui.js
// MESSAGES 에 있다)과 ministryPaper 가 그 자리에서 지어내는 한국어 문장("올릴 줄이 없습니다" 등).
// 코드 꼴이 아니면 그 문장을 그대로 보여준다.
const errMsg = (d) => esc(d?.error && !/^[a-z-]+$/.test(d.error) ? d.error : errorText(d));

// 붙여넣기 파싱 — 탭(엑셀)·콤마(CSV) 둘 다 받는다. 엑셀에서 머리글까지 딸려 오면 첫 줄을 버린다.
export function mpParse(text) {
  const out = [];
  String(text || "").split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t) return;
    const cells = (line.indexOf("\t") >= 0 ? line.split("\t") : line.split(",")).map((x) => x.trim());
    if (!cells.some(Boolean)) return;
    out.push({
      gu: cells[0] || "", mok: cells[1] || "", name: cells[2] || "", position: cells[3] || "",
      phone: cells[4] || "", team: cells[5] || "", committee: cells[6] || "", option: cells[7] || "",
      appliedAt: cells[8] || "", decidedAt: cells[9] || "", status: cells[10] || "", note: cells[11] || "",
    });
  });
  if (out.length && /교구/.test(out[0].gu) && /이름/.test(out[0].name)) out.shift();
  return out;
}

// 엑셀 날짜 칸 → 2026-12-15 꼴 글자. 그 밖은 글자로 다듬기만.
export function mpCell(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, "0");
    return v.getFullYear() + "-" + p(v.getMonth() + 1) + "-" + p(v.getDate());
  }
  return String(v).trim();
}

// 「명단 넣기」 단추는 살펴본 뒤(saved 가 아니고) 넣을 것이 하나라도 있을 때만 보인다.
export const saveVisible = (rows, saved) => !saved && rows.some((r) => r.ok && !r.same);

// 결과 줄 하나 — 기호 넷: ＝(그대로 둠) ✅(저장됨) ◻️(넣을 예정) ⚠️(오류)
export function rowMark(r) {
  if (r.same) return { cls: "same", mark: "＝" };
  if (r.saved) return { cls: "done", mark: "✅" };
  if (r.ok) return { cls: "ok", mark: "◻️" };
  return { cls: "bad", mark: "⚠️" };
}

function rowHtml(r) {
  const { cls, mark } = rowMark(r);
  return `<div class="mp-item ${cls}">
    <div class="mp-i-top"><span class="mp-i-ic">${mark}</span>
      <b>${esc(r.name || "(이름 없음)")}</b><small>${esc([r.gu, r.mok].filter(Boolean).join(" "))}</small>${churchBadgeHtml(r.church)}
      ${r.status ? `<span class="mp-i-st${r.status === "취소" ? " off" : ""}">${esc(paperShort(r.status))}</span>` : ""}
      <span class="mp-i-team">${esc(r.team || "")}${r.committee ? ` <i>${esc(r.committee)}</i>` : ""}</span></div>
    ${r.error ? `<div class="mp-i-msg bad">${esc(r.error)}</div>` : ""}
    ${r.warn ? `<div class="mp-i-msg warn">${esc(r.warn)}</div>` : ""}
  </div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `
    <div class="adm-acts">
      <button type="button" class="btn" data-act="check">살펴보기</button>
      <button type="button" class="btn primary" data-act="save" hidden>명단 넣기</button>
    </div>
    <div class="card">
      <div class="mp-how">
        <div class="mp-files">
          <a class="mp-dl" href="files/사역명단_올리기_양식.xlsx" download>📥 엑셀 양식 내려받기</a>
          <button type="button" class="mp-dl pick" data-act="pick">📂 양식 올리기</button>
          <input type="file" id="mp-file" accept=".xlsx,.xls,.csv" hidden>
          <span class="mp-fname" id="mp-fname"></span>
        </div>
        <div class="mp-cols">${MP_COLS.map((c, i) => `<span${i > 5 ? ' class="dim"' : ""}>${esc(c)}</span>`).join("")}</div>
      </div>
      <details class="mc-guide">
        <summary>📌 적는 법 · 주의할 것</summary>
        <ul class="mp-how-ul">
          <li><b>교구·목장·이름</b>은 앱 로그인과 <b>똑같이</b> 적어 주세요 — 한 글자만 달라도 다른 분이 됩니다.</li>
          <li>앱에 없는 분이면 계정을 새로 만듭니다. 나중에 그분이 앱에 로그인하면 이 신청이 그대로 보입니다.</li>
          <li>사역팀 이름이 여러 부서에 있으면 <b>부서</b>도 적어 주세요.</li>
          <li>앱으로 이미 낸 신청과 겹치면 <b>새로 넣지 않고 그 건의 상태만</b> 바꿉니다.</li>
          <li>이미 같은 상태인 줄은 <b>손대지 않습니다</b> — 같은 명단을 두 번 올려도 안전합니다.</li>
          <li><b>신청일·임명일</b>은 적으면 그 날짜로, 비우면 오늘로 들어갑니다 (2026-12-15 꼴).</li>
          <li><b>상태</b>는 줄마다 「임명」·「취소」·「신청」으로 적습니다. <b>비우면 임명</b>이에요.
              취소로 적은 줄은 <b>사유</b>도 함께 적어 주세요(관리자만 봅니다).</li>
          <li><b>알림은 가지 않습니다.</b> 임명 알림이 필요하면 신청 현황 화면에서 한 분씩 눌러 주세요.</li>
        </ul>
      </details>
      <textarea id="mp-text" class="mp-text" rows="8"
        placeholder="화평&#9;20&#9;홍길동&#9;집사&#9;010-1234-5678&#9;신앙운동&#9;제자양육부&#9;&#9;2026-12-15&#9;2026-12-27&#9;임명"></textarea>
      <div id="mp-sum" class="mp-sum"></div>
      <div id="mp-list"></div>
    </div>`;

  const ta = el.querySelector("#mp-text");
  const fileInput = el.querySelector("#mp-file");
  const fname = el.querySelector("#mp-fname");
  const sumEl = el.querySelector("#mp-sum");
  const listEl = el.querySelector("#mp-list");
  const saveBtn = el.querySelector('[data-act="save"]');
  let mpRows = [];   // 서버가 살펴 준 줄들(마지막 살펴보기·넣기 응답)

  // 붙여넣은 글이 바뀌면 앞서 살핀 결과는 버린다 — 옛 판정으로 넣는 일을 막는다
  const resetAfterEdit = () => {
    mpRows = [];
    saveBtn.hidden = true;
    listEl.innerHTML = "";
    sumEl.textContent = "";
  };

  const renderResult = (saved, d) => {
    const okN = mpRows.filter((r) => r.ok && !r.same).length;
    const sameN = mpRows.filter((r) => r.same).length;
    const badN = mpRows.filter((r) => !r.ok).length;
    sumEl.innerHTML = saved
      ? `📥 <b>${d.added || 0}건</b>을 넣었습니다${d.changed ? ` (그중 상태만 바꾼 것 ${d.changed}건)` : ""}` +
        `${d.same ? ` · 그대로 둔 줄 ${d.same}` : ""}${d.failed ? ` · 실패 ${d.failed}건` : ""}${badN ? ` · 못 넣은 줄 ${badN}` : ""}`
      : `살펴본 줄 <b>${mpRows.length}</b> · 넣을 것 <b>${okN}</b>` +
        `${sameN ? ` · 그대로 둘 것 <b>${sameN}</b>` : ""}${badN ? ` · 고칠 것 <b>${badN}</b>` : ""}`;
    saveBtn.hidden = !saveVisible(mpRows, saved);
    listEl.innerHTML = (hasChurch(mpRows) ? CHURCH_LEGEND : "") + mpRows.map(rowHtml).join("");
  };

  async function run(save) {
    const rows = mpParse(ta.value);
    if (!rows.length) {
      await dialog({ title: "📋 붙여넣은 것이 없습니다", text: "엑셀에서 칸을 복사해 붙여넣어 주세요", cancel: null });
      return;
    }
    if (save) {
      // ⚠️ 확인 창의 건수는 **이 rows**(지금 막 다시 읽은 textarea)로 센다 — 실제로 서버에 보낼 것과
      //    정확히 같은 것이다(원문 체크리스트 31 을 막는다). ok·same 은 서버만 알 수 있어 이 건수는
      //    "지금 적힌 대로 무엇을 보내는지"의 미리보기일 뿐 — 실제 반영 건수는 응답 뒤에 나온다.
      const by = {};
      rows.forEach((r) => { const k = previewStatus(r.status); by[k] = (by[k] || 0) + 1; });
      const yes = await dialog({
        title: "📥 명단을 넣습니다", ok: `${rows.length}줄 넣기`, cancel: "그만두기",
        html: `<b>${rows.length}줄</b>을 지금 적힌 대로 보냅니다 — ` +
          Object.keys(by).map((k) => `<b>${esc(k)} ${by[k]}건</b>`).join(" · ") +
          `<p class="muted" style="margin-top:10px">알림은 가지 않습니다. 실제로 반영된 건수는 넣은 뒤 목록에 나와요.</p>`,
      });
      if (!yes) return;
    }
    const d = await busy(el, () => call(save ? "ministryPaperSave" : "ministryPaperCheck", { rows }));
    if (!d.ok) {
      dialog({ title: save ? "⚠️ 넣지 못했습니다" : "⚠️ 살펴보지 못했습니다", html: errMsg(d), ok: "확인", cancel: null, danger: true });
      return;
    }
    mpRows = d.rows || [];
    renderResult(save, d);
    sumEl.scrollIntoView({ block: "center" });
  }

  async function handleFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    fname.textContent = f.name + " 읽는 중…";
    try {
      let lines = [];
      if (/\.csv$/i.test(f.name)) {
        const text = await f.text();
        lines = text.split(/\r?\n/).map((l) => l.split(",").map((x) => x.trim()));
      } else {
        // 시트가 여럿이면 「명단」 시트를 먼저 본다(양식의 「적는 법」 시트를 실수로 읽지 않게)
        const XLSX = await loadXlsx();
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
        const sheet = wb.SheetNames.indexOf("명단") >= 0 ? "명단" : wb.SheetNames[0];
        lines = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, raw: true })
          .map((row) => (row || []).map(mpCell));
      }
      // 빈 줄·안내 줄은 버린다(양식 맨 아래 「↑ 위 …」 한 줄)
      lines = lines.filter((r) => r.some(Boolean) && !/^[↑※]/.test(r[0] || ""));
      if (!lines.length) throw new Error("empty");
      ta.value = lines.map((r) => r.join("\t")).join("\n");
      resetAfterEdit();   // 파일에서 채운 글도 "붙여넣은 글이 바뀐 것"과 같다 — 살펴보기부터 다시
      fname.textContent = f.name + " · " + lines.length + "줄 읽음";
    } catch {
      fname.textContent = "";
      await dialog({ title: "📂 파일을 읽지 못했습니다",
        text: "엑셀을 읽지 못했어요 — 엑셀에서 칸을 복사해 붙여넣어 주세요", cancel: null, danger: true });
    } finally {
      e.target.value = "";   // 같은 파일을 다시 고를 수 있게
    }
  }

  // 델리게이트 클릭 한 벌 — 살펴보기·명단 넣기·양식 올리기(파일 선택창 열기)
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    if (b.dataset.act === "pick") return fileInput.click();
    if (b.dataset.act === "check") return run(false);
    if (b.dataset.act === "save") return run(true);
  });
  el.addEventListener("input", (e) => { if (e.target.matches("#mp-text")) resetAfterEdit(); });
  el.addEventListener("change", (e) => { if (e.target.matches("#mp-file")) handleFile(e); });
}
