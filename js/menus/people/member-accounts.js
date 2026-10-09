// 👤 성도 계정 — 앱 계정(users) 찾기 · 이름/소속 변경 · 변경 이력 · 합치기(총괄만).
//   성경암송 admin-members 를 옮겨 왔다(2026-10-09). 합치기 로직(RPC)은 성경암송에 그대로 두고 서버가 부른다.
//   역할 members: 찾기·변경·이력. super: 합치기 패널 전체(미리보기+실행).
//   ⚠️ 응답에 user_id 가 담기지만(수정·이력용) 화면에만 쓰고 어디에도 내보내지 않는다.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">👤 성도 계정</h2>`;
const norm = (v) => String(v || "").trim().replace(/\s+/g, " ");
const label = (u) => u.type === "교구"
  ? `${u.name} · ${u.gu}교구 ${u.mok}목장`
  : `${u.name} · ${u.bu} ${u.grade || ""}`;
const COUNT_LABELS = { challenge_log: "암송·도전", progress: "진도", reviews: "복습", passage_progress: "긴 본문",
  board_posts: "게시글", board_replies: "답글", event_entries: "이벤트 참여", pilsa_orders: "필사 신청",
  ministry_orders: "사역 신청", event_signups: "상세 이벤트 신청", push_subscriptions: "알림 기기" };

export async function render(el, { me, call }) {
  const isSuper = !!(me && Array.isArray(me.roles) && me.roles.includes("super"));
  el.innerHTML = TITLE + `
    <p class="muted">앱에 로그인하는 성도 계정이에요. 교적(교인명부)과는 다른 자료예요.</p>
    <form id="ma-search" class="row">
      <input id="ma-q" type="search" placeholder="이름으로 찾기" maxlength="80" autocomplete="off">
      <button class="btn primary" type="submit">찾기</button>
    </form>
    <p id="ma-sstatus" class="muted"></p>
    <div id="ma-results"></div>
    <div id="ma-editor"></div>`;

  const $ = (id) => el.querySelector("#" + id);
  let selected = null, saving = false;
  const setStatus = (id, text) => { const n = $(id); if (n) n.textContent = text || ""; };

  async function search(q) {
    selected = null; $("ma-editor").innerHTML = ""; $("ma-results").innerHTML = "";
    setStatus("ma-sstatus", "찾는 중…");
    const d = await call("memberFind", { query: q });
    if (!d.ok) { setStatus("ma-sstatus", errorText(d)); return; }
    setStatus("ma-sstatus", d.more ? "50명까지만 보여요 — 이름을 더 좁혀 주세요." : `${d.users.length}명`);
    $("ma-results").innerHTML = d.users.map((u) =>
      `<div class="card ma-row" data-u='${esc(JSON.stringify(u))}'>
        <div><b>${esc(label(u))}</b>
          <div class="muted">등록 ${new Date(u.created_at).toLocaleDateString("ko-KR")} · 최근 ${u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString("ko-KR") : "없음"}</div>
        </div>
        <button type="button" class="btn" data-act="edit">수정</button>
      </div>`).join("");
    $("ma-results").querySelectorAll('[data-act="edit"]').forEach((btn) =>
      btn.addEventListener("click", () => openEdit(JSON.parse(btn.closest(".ma-row").dataset.u))));
  }

  function openEdit(u) {
    selected = u;
    const district = u.type === "교구";
    $("ma-editor").innerHTML = `
      <div class="card">
        <div class="muted">선택: ${esc(label(u))}</div>
        <form id="ma-edit" class="grid">
          <label>구분 <select id="ma-type"><option value="교구"${district ? " selected" : ""}>교구</option><option value="교회학교"${!district ? " selected" : ""}>교회학교</option></select></label>
          <label>이름 <input id="ma-name" maxlength="80" value="${esc(u.name || "")}"></label>
          <label class="ma-d">교구 <input id="ma-gu" maxlength="80" value="${esc(u.gu || "")}"></label>
          <label class="ma-d">목장 <input id="ma-mok" maxlength="80" value="${esc(u.mok || "")}" placeholder="숫자 또는 남성"></label>
          <label class="ma-s">부서 <input id="ma-bu" maxlength="80" value="${esc(u.bu || "")}"></label>
          <label class="ma-s">학년 <input id="ma-grade" maxlength="80" value="${esc(u.grade || "")}"></label>
          <label>변경 사유 <input id="ma-reason" maxlength="300" placeholder="바꾸는 까닭"></label>
          <button class="btn primary" type="submit">저장</button>
        </form>
        <p id="ma-estatus" class="muted"></p>
        <div id="ma-history"></div>
      </div>`;
    const toggle = () => {
      const d = $("ma-type").value === "교구";
      el.querySelectorAll(".ma-d").forEach((n) => { n.hidden = !d; });
      el.querySelectorAll(".ma-s").forEach((n) => { n.hidden = d; });
    };
    $("ma-type").addEventListener("change", toggle); toggle();
    $("ma-edit").addEventListener("submit", onSave);
    loadHistory(u.id);
  }

  function formProfile() {
    const type = $("ma-type").value;
    const pr = { type, name: norm($("ma-name").value) };
    if (type === "교구") { pr.gu = norm($("ma-gu").value); pr.mok = norm($("ma-mok").value); pr.bu = null; pr.grade = null; }
    else { pr.bu = norm($("ma-bu").value); pr.grade = norm($("ma-grade").value); pr.gu = null; pr.mok = null; }
    return pr;
  }

  async function onSave(e) {
    e.preventDefault(); if (!selected || saving) return;
    const profile = formProfile(), reason = norm($("ma-reason").value);
    if (!profile.name || !reason ||
        (profile.type === "교구" ? (!profile.gu || !/^(\d+|남성)$/.test(profile.mok)) : (!profile.bu || !profile.grade))) {
      setStatus("ma-estatus", "이름·소속과 변경 사유를 확인해 주세요 (목장은 숫자 또는 남성)."); return;
    }
    const pending = { user_id: selected.id, expected_key: selected.identity_key, profile, reason };
    const go = await dialog({ title: "이렇게 바꿀까요?",
      text: `${label(selected)}\n→ ${label(profile)}\n사유: ${reason}`, ok: "저장", cancel: "그만두기" });
    if (!go) return;
    saving = true;
    await busy($("ma-editor"), async () => {
      const r = await call("memberUpdate", pending);
      if (r.ok) { toast("바꿨어요."); selected = r.user; loadHistory(r.user.id); setStatus("ma-estatus", "저장했어요 — 다시 찾아 확인해 주세요."); }
      else if (r.error === "identity-conflict") { await onConflict(pending); }
      else setStatus("ma-estatus", errorText(r));
    });
    saving = false;
  }

  // 소속 충돌 — super 면 합치기 패널, 아니면 안내만(합치기는 총괄만)
  async function onConflict(pending) {
    if (!isSuper) {
      setStatus("ma-estatus", "이 소속은 다른 계정이 쓰는 중이에요 — 총괄에게 계정 합치기를 요청하세요.");
      return;
    }
    const d = await call("memberMergePreview", pending);
    if (!d.ok) { setStatus("ma-estatus", errorText(d)); return; }
    const counts = (side) => Object.entries(COUNT_LABELS)
      .filter(([k]) => d[side + "_counts"][k] !== undefined)
      .map(([k, t]) => `${t} ${Number(d[side + "_counts"][k]).toLocaleString("ko-KR")}건`).join(" · ");
    const go = await dialog({ title: "두 계정을 합칠까요?", danger: true,
      text: `새 소속이 이미 다른 계정에 있어요. 같은 분이면 합칩니다(되돌릴 수 없어요).\n\n`
        + `원래: ${label(d.source)}\n  ${counts("source")}\n\n남길 쪽: ${label(d.target)}\n  ${counts("target")}`,
      ok: "같은 분 — 합치기", cancel: "그만두기" });
    if (!go) return;
    const r = await call("memberMerge", { source_id: d.source.id, target_id: d.target.id,
      source_key: d.source.identity_key, target_key: d.target.identity_key, reason: pending.reason, confirm_same_person: true });
    if (r.ok) { toast("합쳤어요."); selected = r.user; loadHistory(r.user.id); setStatus("ma-estatus", "두 기록을 합쳤어요."); }
    else setStatus("ma-estatus", errorText(r));
  }

  async function loadHistory(userId) {
    const h = $("ma-history"); if (!h) return;
    h.innerHTML = `<p class="muted">이력 불러오는 중…</p>`;
    const r = await call("memberHistory", { user_id: userId });
    if (!r.ok) { h.innerHTML = `<p class="muted">${esc(errorText(r))}</p>`; return; }
    h.innerHTML = `<h3 class="sub">변경 이력</h3>` + (r.history.length
      ? r.history.map((x) => `<div class="history-item"><small>${esc(new Date(x.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}</small>
          <div>${esc(label(x.before_profile))} → ${esc(label(x.after_profile))}</div><div class="muted">사유: ${esc(x.reason)}</div></div>`).join("")
      : `<p class="muted">변경 이력이 없어요.</p>`);
  }

  $("ma-search").addEventListener("submit", (e) => {
    e.preventDefault(); const q = norm($("ma-q").value); if (q) search(q);
  });
}
