// 선 아이콘(2026-10-17 친구 「성경앱의 스타일로」) — 성경암송 앱 첫 화면 A안(app.js HA_ICON · haSvg)과 같은 그림 · 같은 굵기.
//   처음 화면 메뉴 줄 · 교인명부 화면 머리 · 줄 목록의 아이콘 칸(.a-ic)에 쓴다. 색은 글자색(currentColor)을 따른다.
//   ⚠️ 줄바꿈 글자를 넣지 않는다(dialog 본문 · 교인카드 규칙과 같다). 그림을 더할 때는 24×24 선 그림 한 줄(path d)로.
export const ICON = {
  chev: "M9 6l6 6-6 6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  chart: "M4 20h16M7 16v-5M12 16V6M17 16v-8",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8",
  message: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  flag: "M4 21V4M4 4h12l-2 4 2 4H4",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4",
  scroll: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM8 7h8M8 11h6",
  pen: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  tv: "M3 6h18v12H3zM10 9.5v5l4-2.5z",
  image: "M4 5h16v14H4zM4 16l5-5 5 5M14 14l2-2 4 4M15.5 9h.01",
  leaf: "M11 20A7 7 0 0 1 4 13c0-6 5-9 16-10-1 11-4 16-9 17zM4 21c3-6 7-9 11-11",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  folder: "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  doc: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  medal: "M12 22a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8 11 5 2h4l3 6M16 11l3-9h-4l-3 6",
  reply: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v4",
  cloud: "M18 10h-1.3A6 6 0 1 0 6 16h12a3 3 0 0 0 0-6z",
  book: "M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z",
  checkc: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6",
  cap: "M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 20.9 10H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  calendar: "M3 5h18v16H3zM8 3v4M16 3v4M3 10h18M9 15.5l2 2 4-4",
  heart: "M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z",
  cards: "M9 3h10a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM5 7v12a2 2 0 0 0 2 2h9",
  key: "M15 3a6 6 0 0 0-5.7 7.9L3 17.2V21h3.8l.9-.9v-2h2v-2h2l1.4-1.4A6 6 0 1 0 15 3zM16.5 8.5h.01",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  church: "M12 2v4M10 4h4M5 21V11l7-5 7 5v10M9 21v-5h6v5",
  house: "M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  print: "M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z",
  plus: "M12 5v14M5 12h14",
};

export function lineSvg(name, cls = "") {
  const d = ICON[name] || ICON.chev;
  return `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

// 메뉴마다 그림 — 처음 화면 줄(home-view.js). 없는 메뉴는 메뉴 목록의 그림 글자(icon)를 그대로 쓴다.
//   메뉴를 더하면(registry.js) 여기에도 한 줄 — 빠지면 그림 글자로 나올 뿐 깨지지는 않는다(tests/home-view.test.mjs 가 빠진 것을 센다).
export const MENU_ICON = {
  people: "search", "people-stats": "chart", "member-accounts": "user", "people-ask": "message",
  "mem-stats": "chart", "mem-board": "flag", "mem-config": "sliders", "mem-passages": "scroll", "mem-pilsa": "pen",
  "mem-chatlog": "message", "mem-push": "bell", "mem-monitor": "shield",
  "sermon-manage": "tv", "sermon-image": "image", "sermon-meditation": "leaf", "praise-archive": "music",
  status: "list", catalog: "folder", paper: "doc", appointed: "medal", "mn-history": "scroll", "mn-requests": "reply", "mn-stats": "chart",
  "be-roster": "list", "be-upload": "cloud", "be-history": "user",
  "edu-courses": "book", "edu-enroll": "doc", "edu-attend": "checkc", "edu-cert": "cap", "edu-stats": "chart",
  "duty-boards": "gear", "duty-roster": "calendar", "duty-people": "users",
  "nf-card": "cards", "nf-board": "list", "nf-ceremony": "medal", "nf-stats": "chart", "nf-staff": "users",
  members: "key", testers: "flask", audit: "clock", "life-reset": "lock",
};

// 화면 머리 — [아이콘 칸] 제목(교인명부 화면 · 2026-10-17). extra 는 이미 esc 된 글(시험판 꼬리표 등)
export const aTitle = (icon, text, extra = "") =>
  `<h2 class="page-title a-title"><span class="a-tic" aria-hidden="true">${lineSvg(icon)}</span>${text}${extra}</h2>`;
