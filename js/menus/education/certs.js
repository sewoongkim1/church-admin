// 🎓 수료 — 강좌 고르기 · 확정된 분마다 출석률·확인 체크·후보·수료번호 · 「후보 N분 수료 확정」 · 한 분씩 확정·취소 ·
//   🖨️ 수료증 인쇄(A4 가로 · 한 장에 한 분 · 브라우저 인쇄) · ⚙️ 수료증 설정(교육 총괄만 — 발급 명의·문안·직인 · 미리보기)
//   (교육신청 3단계 · 2026-10-05 · 계획 v2 docs/superpowers/plans/2026-10-05-education-stage3-certificates.md)
//   서버: eduCourses·eduCertList·eduCheckSet·eduCertIssue·eduCertRevoke·eduCertPrint·eduCertSettings·eduCertSettingsSave
//   역할 education(교육 총괄 — 모든 강좌) · educourse(교육 담당 — manager 로 맡은 강좌만 · 서버 mayTouch 가 not-assigned).
//   강사(teacher)는 이 메뉴가 없다(서버도 문에서 forbidden). 강좌 목록은 eduCourses 가 거른 그대로.
//   규칙(글·후보·오류 말·설정 칸)은 certs-logic.js · 수료증 한 장은 cert-template.js(시험).
// ⚠️ 번호는 SQL 한 곳(edu_cert_take) — 화면은 받은 certNo 를 보이기만. 후보는 서버 candidate · 확인 체크 직후에만 candidateOf 로 다시 셈.
// ⚠️ 고르기는 picker.js(pickOne)만 — 시스템 select·date·time 칸 금지. 서버 글자는 모두 esc. 응답에 user_id 는 없다.
// ⚠️ 인쇄 틀(@page A4 가로·여백 0)은 인쇄 판을 연 동안만 <style> 로 넣고 닫을 때 뺀다 — 다른 화면의 인쇄에 새지 않게.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne } from "../../core/picker.js";
import {
  courseLabel, courseOptions, initialCourse, ruleText, attendText, candidateOf, countsOf, pendingOf, headLine, markOf, rowAction,
  issueLabel, issueAsk, belowAsk, revokeAsk, issueDoneText, revokeDoneText, certErrorText, reloadAfter, printCerts, NO_PRINT,
  ISSUER_MAX, BODY_MAX, BODY_HINT, fillBody, countText, settingsPatch, SEAL_STEPS, SEAL_MAX_BYTES, fitSize, dataUrlBytes, hasAlpha,
  whiteToAlpha, sealOutType, SEAL_HINT, sealFileError, SEAL_TOO_BIG, isChief, EMPTY_ASSIGNED, EMPTY_ALL, NO_PEOPLE, ARCHIVED_NOTE,
} from "./certs-logic.js";
import { certHtml, sealSrc } from "./cert-template.js";

const TITLE = `<h2 class="page-title">🎓 수료</h2>`;
const LOADING = `<p class="empty">불러오는 중…</p>`;
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

let lastCourseId = "";   // 메뉴를 나갔다 와도 보던 강좌를 기억(모듈 안)

// ---------- 수료증 글꼴(명조) — 인쇄·미리보기를 열 때 한 번만 부른다 ----------
//   웹 글꼴이 안 오면(오프라인 등) 기기 명조(바탕·AppleMyungjo)로 찍힌다(css .ec-cert font-family).
//   ⚠️ 이름이 담긴 text= 꼴로 부르지 않는다(구글에 이름을 보내지 않게) — 한글 조각(unicode-range)은 쓰는 글자의 조각만 받는다.
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap";
let fontLink = null;
function ensureCertFont() {
  if (!fontLink) {
    fontLink = new Promise((ok) => {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = FONT_HREF;
      l.onload = () => ok(true); l.onerror = () => ok(false);
      document.head.appendChild(l);
    });
  }
  return fontLink;
}
// 상자 안 글자의 조각을 모두 받고 그림이 다 온 뒤(최대 5초) — 인쇄 창이 빈 글꼴·빈 그림으로 뜨지 않게
async function certReady(box) {
  const wait = (async () => {
    if (await ensureCertFont() && document.fonts) {
      const text = box.textContent || "수료증";
      await Promise.all([400, 700, 800].map((w) => document.fonts.load(`${w} 20px "Nanum Myeongjo"`, text).catch(() => null)));
    }
    await Promise.all([...box.querySelectorAll("img")].map((i) => (i.complete ? 0 : new Promise((ok) => { i.onload = i.onerror = ok; }))));
  })();
  await Promise.race([wait, new Promise((ok) => setTimeout(ok, 5000))]);
}

// ---------- 인쇄 판 ----------
let printBox = null;
function closePrint() {
  if (!printBox) return;
  printBox.remove(); printBox = null;
  document.getElementById("ec-cert-page")?.remove();
  document.body.classList.remove("ec-cert-on");
  window.removeEventListener("hashchange", closePrint);
  document.removeEventListener("keydown", onPrintKey);
}
function onPrintKey(e) { if (e.key === "Escape" && !document.querySelector(".dlg-dim")) closePrint(); }
async function openPrint(d) {
  closePrint();
  const certs = printCerts(d);
  const box = document.createElement("div");
  box.className = "ec-cert-pv";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "수료증 인쇄");
  box.innerHTML = `<div class="ec-cert-bar"><div class="ec-cert-bar-t"><b>🖨️ 수료증 ${certs.length}장</b><span>${esc(d.course?.title || "")}${d.course?.term ? " · " + esc(d.course.term) : ""} · A4 가로 · 한 장에 한 분</span></div>
      <div class="ec-cert-bar-b"><button type="button" class="btn primary" data-pv="print">인쇄하기</button><button type="button" class="btn" data-pv="close">닫기</button></div></div>
    <div class="ec-cert-pages">${certs.map((c) => `<div class="ec-cert-sheet">${certHtml(c)}</div>`).join("")}</div>`;
  const page = document.createElement("style");
  page.id = "ec-cert-page";
  page.textContent = "@page{size:A4 landscape;margin:0}";
  document.head.appendChild(page);
  document.body.appendChild(box);
  document.body.classList.add("ec-cert-on");
  printBox = box;
  window.addEventListener("hashchange", closePrint);   // 메뉴를 옮기면 닫는다(route 는 입력 창만 닫는다)
  document.addEventListener("keydown", onPrintKey);
  const go = async (btn) => {
    if (btn) btn.disabled = true;
    try { await certReady(box); if (printBox === box) window.print(); } finally { if (btn) btn.disabled = false; }
  };
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-pv]");
    if (!b) return;
    if (b.dataset.pv === "close") closePrint(); else go(b);
  });
  box.querySelector('[data-pv="print"]').focus({ preventScroll: true });
  await go(box.querySelector('[data-pv="print"]'));
}

// ---------- 직인 그림 다듬기(캔버스) — 600px 안 · 흰 바탕 투명(바탕이 있을 때만) · GIF→PNG · 300KB 안 ----------
function loadImage(file) {
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error("image")); };
    img.src = url;
  });
}
async function makeSeal(file, clear) {
  const bad = sealFileError(file);
  if (bad) return { ok: false, message: bad };
  let img;
  try { img = await loadImage(file); } catch { return { ok: false, message: "그림을 읽지 못했어요 — 다른 그림으로 골라 주세요" }; }
  for (const side of SEAL_STEPS) {
    const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, side);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d");
    g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h);
    let alpha = hasAlpha(px.data);
    if (!alpha && clear) { whiteToAlpha(px.data); g.putImageData(px, 0, 0); alpha = true; }
    const type = sealOutType(file.type, alpha);
    const url = type === "image/jpeg" ? cv.toDataURL("image/jpeg", 0.9) : cv.toDataURL("image/png");
    if (dataUrlBytes(url) <= SEAL_MAX_BYTES) return { ok: true, url };
  }
  return { ok: false, message: SEAL_TOO_BIG };
}

// ---------- 수료증 설정 창(교육 총괄만) ----------
async function openSettings({ call, course }) {
  const r = await call("eduCertSettings", {});
  if (!r.ok) { toast(certErrorText(r) || errorText(r)); return; }
  const cur = { issuer: r.issuer || "", body: r.body || "", seal: r.seal || null };
  let seal = cur.seal, file = null, making = 0;
  const sample = () => ({ name: "홍길동", title: course?.title || "예시 과정", term: course?.term || "", from: course?.from || null, to: course?.to || null,
    certNo: "고척-2026-0001", issuedOn: kstToday() });
  const sealBox = () => (sealSrc(seal) ? `<img src="${sealSrc(seal)}" alt="지금 직인">` : `<span>직인 없음</span>`);
  const values = (root) => ({ issuer: root.querySelector("[data-f=issuer]").value, body: root.querySelector("[data-f=body]").value, seal });
  const paint = (root) => {
    const v = values(root), s = sample();
    root.querySelector("[data-cnt=issuer]").textContent = countText(v.issuer, ISSUER_MAX);
    root.querySelector("[data-cnt=body]").textContent = countText(v.body, BODY_MAX);
    root.querySelector(".ecert-seal-box").innerHTML = sealBox();
    root.querySelector("[data-seal-del]").hidden = !seal;
    root.querySelector(".ecert-pvw-in").innerHTML = certHtml({ ...s, issuer: v.issuer, body: fillBody(v.body, s.title), seal });
  };
  const said = (root, t) => { const m = root.querySelector(".ecert-seal-msg"); m.textContent = t || ""; m.hidden = !t; };
  const rework = async (root) => {
    if (!file) return;
    const my = ++making;
    said(root, "그림을 다듬는 중…");
    const out = await makeSeal(file, root.querySelector("[data-f=clear]").checked);
    if (my !== making || !root.isConnected) return;
    if (!out.ok) { said(root, out.message); return; }
    seal = out.url; said(root, ""); paint(root);
  };
  return openForm({
    title: "⚙️ 수료증 설정", okLabel: "저장",
    html: `<div class="ecert-set">
      <label class="field"><span>발급 명의 <small data-cnt="issuer"></small></span><input data-f="issuer" maxlength="${ISSUER_MAX}" autocomplete="off" value="${esc(cur.issuer)}" placeholder="예: 고척교회 담임목사 ○○○"></label>
      <label class="field"><span>문안 <small data-cnt="body"></small></span><textarea data-f="body" rows="4" maxlength="${BODY_MAX}">${esc(cur.body)}</textarea></label>
      <p class="be-hint">${esc(BODY_HINT)}</p>
      <div class="field"><span>직인 · 서명 그림</span>
        <div class="ecert-seal-row"><div class="ecert-seal-box"></div>
          <div class="ecert-seal-acts"><label class="btn ecert-file">그림 고르기<input type="file" accept="image/png,image/jpeg,image/gif" data-f="seal"></label>
            <button type="button" class="btn danger" data-seal-del>직인 빼기</button></div></div>
        <label class="ecert-clear"><input type="checkbox" data-f="clear" checked> 흰 바탕을 투명하게(바탕이 흰 사진·스캔일 때)</label>
        <p class="ecert-seal-msg" role="status" hidden></p>
        <p class="be-hint ecert-seal-hint">${esc(SEAL_HINT)}</p></div>
      <div class="ecert-pvw"><p class="muted">미리보기 — 예시 이름 「홍길동」${course ? " · 고른 강좌" : ""}로 그려요</p><div class="ecert-pvw-in"></div></div></div>`,
    onOpen: (root) => {
      paint(root);
      ensureCertFont();
      root.addEventListener("input", (e) => { if (e.target.matches("[data-f=issuer],[data-f=body]")) paint(root); });
      root.addEventListener("change", async (e) => {
        if (e.target.matches("[data-f=seal]")) {
          const f = e.target.files && e.target.files[0];
          e.target.value = "";   // 같은 그림을 다시 골라도 change 가 오게
          if (!f) return;
          const bad = sealFileError(f);
          if (bad) { said(root, bad); return; }
          file = f; await rework(root);
        } else if (e.target.matches("[data-f=clear]")) await rework(root);
      });
      root.addEventListener("click", (e) => {
        if (!e.target.closest("[data-seal-del]")) return;
        making++; file = null; seal = null; said(root, ""); paint(root);
      });
    },
    isDirty: (root) => { const v = values(root); return v.issuer !== cur.issuer || v.body !== cur.body || seal !== cur.seal; },
    onSubmit: async (root) => {
      const p = settingsPatch(cur, values(root));
      if (!p.ok) return { ok: false, message: p.message };
      if (!Object.keys(p.patch).length) { toast("바꾼 것이 없어요"); return { ok: true, value: false }; }
      const s = await call("eduCertSettingsSave", p.patch);
      if (!s.ok) return { ok: false, message: certErrorText(s) || errorText(s) };
      toast(s.changed ? "수료증 설정을 저장했어요" : "바꾼 것이 없어요");
      return { ok: true, value: true };
    },
  });
}

// ---------- 그리기(글만) ----------
function rowHtml(p, course) {
  const mk = markOf(p), act = rowAction(p, course), chk = String(course?.checkLabel || "").trim();
  const below = p.below === true && !p.completed;
  return `<div class="ecert-row${p.completed ? " done" : p.revoked ? " rv" : p.candidate ? " cand" : ""}" data-eid="${esc(p.id)}">
    <div class="ecert-l1"><div class="ecert-who"><b>${esc(p.name)}</b>${p.who ? `<span>${esc(p.who)}</span>` : ""}</div>
      <div class="ecert-att${below ? " below" : ""}">${esc(attendText(p.attend))}${below ? "<em>기준 미달</em>" : ""}</div></div>
    <div class="ecert-l2">${chk ? `<label class="ecert-chk"><input type="checkbox" data-chk${p.checkDone ? " checked" : ""}${course?.archived ? " disabled" : ""}> ${esc(chk)} 확인</label>` : ""}
      ${mk ? `<span class="ecert-mk ${mk.cls}">${mk.cls === "done" ? "🎓 " : ""}${esc(mk.text)}</span>` : ""}
      ${act ? `<button type="button" class="btn${act.danger ? " danger" : act.primary ? " primary" : ""} ecert-op" data-op="${act.op}">${esc(act.label)}</button>` : ""}</div>
  </div>`;
}

// ---------- 화면 ----------
export async function render(el, { me, call }) {
  el.classList.add("ecert-page");   // PC 에서 읽기 좋은 폭(css .ecert-page)
  el.innerHTML = TITLE + LOADING;
  const chief = isChief(me?.roles);
  let courses = [], scope = "all", cur = null, people = [];
  const pending = new Set();   // 저장 중인 줄·단추 — 두 번 누름 막기
  const failText = (r) => certErrorText(r, people) || errorText(r);

  const loadCourses = async () => {
    const r = await call("eduCourses", {});
    if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return false; }
    courses = r.courses || [];
    scope = r.scope === "assigned" ? "assigned" : "all";
    return true;
  };
  // 강좌 c 의 수료 명단 — 실패하면 아무것도 바꾸지 않는다 → {ok} · {ok:false, gone, code} · {ok:false, error}
  const loadList = async (c) => {
    const r = await call("eduCertList", { course_id: c.id });
    if (!r.ok && r.error === "not-found") return { ok: false, gone: "그 강좌를 찾지 못했어요", code: r.error };
    if (!r.ok && r.error === "not-assigned") return { ok: false, gone: failText(r), code: r.error };
    if (!r.ok) return { ok: false, error: r };
    cur = { ...c, ...r.course }; people = r.people || [];
    return { ok: true };
  };
  const reloadAll = async () => {
    if (!(await loadCourses())) return;
    const again = cur && courses.find((c) => c.id === cur.id);
    if (!again) { cur = null; people = []; lastCourseId = ""; draw(); return; }
    const r = await loadList(again);
    if (!r.ok) { cur = null; people = []; lastCourseId = ""; if (r.error) toast(errorText(r.error)); }
    draw();
  };
  const reloadList = async () => {
    if (!cur) return;
    const r = await loadList(cur);
    if (r.code === "not-assigned") { toast(r.gone); await reloadAll(); return; }
    if (r.gone) { toast(r.gone); cur = null; people = []; lastCourseId = ""; }
    else if (!r.ok) { toast(errorText(r.error)); return; }
    draw();
  };
  const afterFail = async (r) => {
    toast(failText(r));
    const what = reloadAfter(r.error);
    if (what === "courses") await busy(el, reloadAll); else if (what === "list") await busy(el, reloadList);
  };

  const topHtml = () => `<div class="ecert-top"><button type="button" class="btn wide ea-course" data-act="course">${esc(cur ? courseLabel(cur) : "강좌 고르기")}</button>` +
    (chief ? `<button type="button" class="btn ecert-set-btn" data-act="settings">⚙️ 수료증 설정</button>` : "") + `</div>`;
  const headHtml = () => {
    const k = countsOf(people), n = k.candidates;
    return `<div class="ecert-sum"><p class="ecert-rule">수료 기준 · <b>${esc(ruleText(cur))}</b></p><p class="ecert-head" data-head>${esc(headLine(k))}</p></div>` +
      (cur.archived ? `<p class="ea-note">${esc(ARCHIVED_NOTE)}</p>` : "") +
      `<div class="ecert-tools">${cur.archived ? "" : `<button type="button" class="btn primary ecert-all" data-act="issue-all"${n ? "" : " hidden"}>${esc(issueLabel(n))}</button>`}
        <button type="button" class="btn ecert-print" data-act="print">🖨️ 수료증 인쇄${k.completed ? ` (${k.completed}장)` : ""}</button></div>`;
  };
  const draw = () => {
    if (!el.isConnected) return;
    if (!courses.length) {
      el.innerHTML = TITLE + (chief ? `<div class="ecert-top"><button type="button" class="btn ecert-set-btn" data-act="settings">⚙️ 수료증 설정</button></div>` : "") +
        `<p class="empty">${esc(scope === "assigned" ? EMPTY_ASSIGNED : EMPTY_ALL)}</p>`;
      return;
    }
    if (!cur) { el.innerHTML = TITLE + topHtml() + `<p class="empty">강좌를 골라 주세요</p>`; return; }
    el.innerHTML = TITLE + topHtml() + headHtml() +
      (people.length ? `<div class="ecert-list">${people.map((p) => rowHtml(p, cur)).join("")}</div>` : `<p class="empty">${esc(NO_PEOPLE)}</p>`);
  };
  // 한 줄과 위 수·「후보 N분」 단추만 다시(스크롤·초점 그대로)
  const paintRow = (p) => {
    const sel = `.ecert-row[data-eid="${CSS.escape(String(p.id))}"]`, row = el.querySelector(sel);
    const had = !!(row && row.contains(document.activeElement) && document.activeElement.matches("[data-chk]"));
    if (row) row.outerHTML = rowHtml(p, cur);
    if (had) el.querySelector(sel + " [data-chk]")?.focus({ preventScroll: true });   // 체크 칸 초점을 그대로(키보드로 줄줄이 체크)
    const k = countsOf(people);
    const h = el.querySelector("[data-head]"); if (h) h.textContent = headLine(k);
    const all = el.querySelector("[data-act=issue-all]");
    if (all) { all.hidden = !k.candidates; all.textContent = issueLabel(k.candidates); }
  };

  // ---------- 처음 ----------
  if (!(await loadCourses())) return;
  const first = initialCourse(courses, lastCourseId);
  if (first) {
    const r = await loadList(first);
    if (r.ok) lastCourseId = first.id;
    else if (r.gone) lastCourseId = "";
    else { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r.error))}</p>`; return; }
  }
  draw();

  // ---------- 동작 ----------
  async function issueAll() {
    const list = pendingOf(people);
    if (!list.length) return;
    const my = cur;
    const html = `<p class="ecert-ask">${esc(issueAsk(list.length))}</p><ol class="ecert-names">${list.map((p) =>
      `<li><b>${esc(p.name)}</b>${p.who ? ` <small>${esc(p.who)}</small>` : ""}</li>`).join("")}</ol>`;
    const yes = await dialog({ title: issueLabel(list.length), html, ok: "수료 확정", cancel: "그만두기", cls: "ecert-dlg" });
    if (!yes || cur !== my) return;
    const r = await busy(el, () => call("eduCertIssue", { course_id: my.id, enrollment_ids: list.map((p) => p.id) }));
    if (!r.ok) { await afterFail(r); return; }
    toast(issueDoneText(r.issued));
    await busy(el, reloadList);
  }
  async function issueOne(p) {
    if (!p.candidate) {
      const yes = await dialog({ title: `확정 — ${p.name}`, text: belowAsk(p, cur), ok: "수료 확정", cancel: "그만두기" });
      if (!yes) return;
    }
    const r = await busy(el, () => call("eduCertIssue", { course_id: cur.id, enrollment_ids: [p.id] }));
    if (!r.ok) { await afterFail(r); return; }
    toast(issueDoneText(r.issued));
    await busy(el, reloadList);
  }
  async function revoke(p) {
    const yes = await dialog({ title: `수료 취소 — ${p.name}`, text: revokeAsk(p), ok: "수료 취소", cancel: "그만두기", danger: true });
    if (!yes) return;
    const r = await busy(el, () => call("eduCertRevoke", { enrollment_id: p.id }));
    if (!r.ok) { await afterFail(r); return; }
    toast(revokeDoneText(r));
    await busy(el, reloadList);
  }
  async function print() {
    const r = await busy(el, () => call("eduCertPrint", { course_id: cur.id }));
    if (!r.ok) { await afterFail(r); return; }
    if (!(r.people || []).length) { toast(NO_PRINT); return; }
    await openPrint(r);
  }

  el.addEventListener("click", async (ev) => {
    const a = ev.target.closest("button[data-act]");
    if (a) {
      const act = a.dataset.act;
      if (act === "course") {
        const got = await pickOne({ anchor: a, title: "강좌", value: cur ? cur.id : "", options: courseOptions(courses) });
        if (got === null || (cur && got === cur.id)) return;
        const next = courses.find((c) => c.id === got);
        if (!next) return;
        const r = await busy(el, () => loadList(next));   // 실패하면 보던 강좌가 그대로 남는다
        if (r.gone) { toast(r.gone); if (r.code === "not-assigned") await busy(el, reloadAll); return; }
        if (!r.ok) { toast(errorText(r.error)); return; }
        lastCourseId = cur.id; draw();
        return;
      }
      if (pending.has(act)) return;
      pending.add(act);
      try {
        if (act === "settings") { if (await openSettings({ call, course: cur })) { /* 설정은 명단에 안 보인다 — 다시 부르지 않는다 */ } }
        else if (!cur) return;
        else if (act === "issue-all") await issueAll();
        else if (act === "print") await print();
      } finally { pending.delete(act); }
      return;
    }
    const op = ev.target.closest("button[data-op]");
    if (op && cur) {
      const row = op.closest("[data-eid]"), p = people.find((x) => String(x.id) === row?.dataset.eid);
      if (!p) return;
      const key = "row" + p.id;
      if (pending.has(key)) return;
      pending.add(key);
      try { if (op.dataset.op === "revoke") await revoke(p); else await issueOne(p); } finally { pending.delete(key); }
    }
  });

  // 확인 항목 체크 — 누르면 바로 저장(먼저 화면을 바꾸고 서버가 거절하면 되돌린다) · 후보는 같은 규칙으로 다시 셈
  el.addEventListener("change", async (ev) => {
    const box = ev.target.closest("input[data-chk]");
    if (!box || !cur) return;
    const row = box.closest("[data-eid]"), p = people.find((x) => String(x.id) === row?.dataset.eid);
    if (!p) return;
    const key = "chk" + p.id;
    if (pending.has(key)) { box.checked = !box.checked; return; }
    pending.add(key);
    const want = box.checked, prev = { checkDone: p.checkDone, candidate: p.candidate }, my = cur;
    p.checkDone = want; p.candidate = candidateOf(p, cur); paintRow(p);
    try {
      const r = await call("eduCheckSet", { enrollment_id: p.id, done: want });
      if (!r.ok) {
        if (cur === my) { Object.assign(p, prev); paintRow(p); }
        await afterFail(r);
      }
    } finally { pending.delete(key); }
  });
}
