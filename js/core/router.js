// 주소의 # 뒤를 메뉴로 읽는다: #/메뉴/하위?조건
export function parseHash(hash) {
  const h = String(hash || "").replace(/^#\/?/, "");
  const [path, q = ""] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  return { menu: parts[0] || "", sub: parts[1] || "", query: Object.fromEntries(new URLSearchParams(q)) };
}

export function go(path) {
  location.hash = "#/" + String(path || "").replace(/^[#/]+/, "");
}
