// ✍️ 필사 신청 명단 — 성경필사 노트 신청 명단·상태 바꾸기. 성경암송 api 프록시(pilsaList·pilsaSetStatus). 역할 memorizeadmin.
//   ⚠️ 휴대폰 번호는 노트를 전해 드리는 담당자가 본다(가리지 않는다).
import { esc, toast, busy, errorText, dialog } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">✍️ 필사 신청 명단</h2>`;
const STATUS = ["신청완료", "준비중", "준비완료", "배부완료"];
// 성경 단위 이름 — 성경암송 앱 js/pilsa.js 의 PILSA_UNITS 와 같은 순서·묶음(「외」는 한 권에 묶여 제작되는 책)
const UNIT = {
  ot01: "창세기", ot02: "출애굽기", ot03: "레위기", ot04: "민수기", ot05: "신명기",
  ot06: "여호수아", ot07: "사사기 외", ot08: "사무엘상", ot09: "사무엘하",
  ot10: "열왕기상", ot11: "열왕기하", ot12: "역대상", ot13: "역대하", ot14: "에스라 외",
  ot15: "욥기", ot16: "시편", ot17: "잠언 외", ot18: "이사야", ot19: "예레미야 외",
  ot20: "에스겔 외", ot21: "호세아 외",
  nt01: "마태복음", nt02: "마가복음", nt03: "누가복음", nt04: "요한복음", nt05: "사도행전",
  nt06: "로마서", nt07: "고린도전서 외", nt08: "갈라디아서 외", nt09: "히브리서 외", nt10: "요한계시록",
};
const qtyText = (q) => Object.entries(q || {}).filter(([, n]) => n > 0).map(([k, n]) => `${UNIT[k] || k} ${n}`).join(" · ");

// 상태에 맞는 문자 문구 — 옛 성경암송 관리 화면(admin-stats)과 같은 글. 담당자가 손대지 않고 그대로 보낼 수 있게
function smsText(r) {
  const n = Number(r.qty ?? r.total) || 0;
  if (r.status === "준비완료")
    return `[고척교회 신앙운동팀] 안녕하세요 ${r.name} 성도님, 신청하신 성경필사 노트가 준비되었습니다. 주일에 4층 새가족실에서 찾아가세요. 평안한 한 주 되시고요. 샬롬!! 샬롬!!`;
  if (r.status === "준비중") return `[고척교회 신앙운동팀] ${r.name} 성도님, 신청하신 성경필사 노트 ${n}권을 준비하고 있습니다. 준비되면 다시 알려드리겠습니다.`;
  if (r.status === "배부완료") return `[고척교회 신앙운동팀] ${r.name} 성도님, 성경필사 노트 잘 받으셨는지요. 매일 한 구절씩 손으로 새기시길 응원합니다.`;
  return `[고척교회 신앙운동팀] ${r.name} 성도님, 신청하신 성경필사 노트 ${n}권 관련하여 연락드립니다.`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="muted" id="pl-status">불러오는 중…</p><div id="pl-list"></div>`;

  let cur = [];   // 마지막으로 받은 명단 — 문자 문구를 만들 때 쓴다
  const draw = (rows) => {
    cur = rows;
    el.querySelector("#pl-status").textContent = `${rows.length}건`;
    el.querySelector("#pl-list").innerHTML = rows.length ? rows.map((r) => `
      <div class="card" data-id="${esc(r.id)}">
        <div><b>${esc(r.name || "이름 없음")}</b> <span class="muted">${esc(r.who || "")}</span></div>
        <div class="muted">${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a> <button type="button" class="btn" data-act="sms" data-sms="${esc(r.id)}">✉️ 문자</button>` : "-"} · ${esc(r.size || "")} ${esc(r.type1 || "")} ${esc(r.type2 || "")} · 총 ${esc(r.total ?? 0)}권 · ${esc(r.at || "")}</div>
        <div style="margin:3px 0">${esc(qtyText(r.qtys))}${r.memo ? ` · <span class="muted">${esc(r.memo)}</span>` : ""}</div>
        <div class="acts"><select data-status>${STATUS.map((s) => `<option${s === r.status ? " selected" : ""}>${s}</option>`).join("")}</select>
          <button type="button" class="btn" data-act="save">상태 저장</button></div>
      </div>`).join("") : `<p class="muted">신청이 없어요.</p>`;
    el.querySelectorAll('[data-act="save"]').forEach((btn) => btn.addEventListener("click", async () => {
      const card = btn.closest(".card"); const id = Number(card.dataset.id); const status = card.querySelector("[data-status]").value;
      const r0 = cur.find((x) => Number(x.id) === id) || {};
      // 배부완료로 바꾸면 서버가 휴대폰 번호를 지운다(개인정보 안내가 약속한 것) — 되돌릴 수 없으니 한 번 묻는다
      if (status === "배부완료" && r0.phone && !(await dialog({ title: "배부완료로 바꿀까요?",
        text: `${r0.name}님의 휴대폰 번호(${r0.phone})가 함께 지워져요. 되돌릴 수 없어요.`, ok: "바꾸고 번호 지우기", danger: true }))) return;
      await busy(el, async () => {
        const r = await call("pilsaSetStatus", { id, status });
        if (!r.ok) { toast(errorText(r)); return; }
        // 준비완료 알림은 앱 알림을 켠 분께만 간다 — 못 갔으면 문자로 보내라고 알린다(발송이 고장 난 것과 구분)
        if (r.phoneCleared) toast(`🔒 ${r0.name}님의 휴대폰 번호를 지웠어요 — 배부가 끝났으니 더 보관하지 않아요`);
        else if (status === "준비완료" && r.pushed > 0) toast(`📨 ${r0.name}님께 알림을 보냈어요 (기기 ${r.pushed}대)`);
        else if (status === "준비완료" && (!r.pushError || r.pushError === "not-subscribed")) toast(`📞 ${r0.name}님은 앱 알림을 켜지 않으셨어요 — 「✉️ 문자」를 눌러 보내 주세요`);
        else if (status === "준비완료") toast(`⚠️ 알림 발송 실패 — 문자로 보내 주세요 (${r.pushError})`);
        else toast("저장했어요.");
        load();
      });
    }));
    // 폰이면 문자 앱을 문구까지 채워 열고, PC면 문구를 복사해 준다(문자 서비스 없이 담당자 폰으로 바로 보낸다)
    el.querySelectorAll('[data-act="sms"]').forEach((btn) => btn.addEventListener("click", () => {
      const r = cur.find((x) => String(x.id) === btn.dataset.sms); if (!r || !r.phone) return;
      // 화면에서 상태를 바꿔 놓고 저장 전이면 그 상태의 문구로
      const st = btn.closest(".card").querySelector("[data-status]").value;
      const text = smsText({ ...r, status: st });
      if (/android|iphone|ipad|ipod/i.test(navigator.userAgent)) { location.href = `sms:${r.phone.replace(/[^0-9]/g, "")}?&body=${encodeURIComponent(text)}`; return; }
      const show = () => dialog({ title: `${r.phone} 로 보낼 문구`, text, cancel: null });
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(`📋 ${r.name}님께 보낼 문구를 복사했어요 — ${r.phone}`)).catch(show);
      else show();
    }));
  };

  const load = async () => {
    const r = await call("pilsaList");
    if (!r.ok) { el.querySelector("#pl-status").textContent = errorText(r); return; }
    draw(r.list || []);
  };
  await load();
}
