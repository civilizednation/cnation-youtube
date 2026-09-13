import { createHmac, timingSafeEqual } from "node:crypto";

export function normalizeYouTube(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("유튜브 영상 링크를 입력해 주세요.");
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("올바른 유튜브 링크를 입력해 주세요."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) throw new Error("올바른 유튜브 링크를 입력해 주세요.");
  let id = "";
  if (url.hostname === "youtu.be") id = url.pathname.replace(/^\/+|\/+$/g, "");
  else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
    else id = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})\/?$/)?.[1] || "";
  }
  if (!/^[\w-]{11}$/.test(id)) throw new Error("재생목록 주소가 아닌 개별 영상 링크를 입력해 주세요.");
  return `https://www.youtube.com/watch?v=${id}`;
}
export function equalSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aa = createHmac("sha256", "clipdown-compare").update(a).digest();
  const bb = createHmac("sha256", "clipdown-compare").update(b).digest();
  return timingSafeEqual(aa, bb);
}
export function signToken(payload, secret) {
  if (!secret || secret.length < 32) throw new Error("APP_SECRET 설정이 필요합니다.");
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}
export function verifyToken(token, secret, kind, now = Date.now()) {
  if (typeof token !== "string" || token.length > 4096 || !secret || secret.length < 32) throw new Error("유효하지 않은 접근 정보입니다.");
  const pieces = token.split(".");
  if (pieces.length !== 2 || !equalSecret(pieces[1], createHmac("sha256", secret).update(pieces[0]).digest("base64url"))) throw new Error("접근 정보가 일치하지 않습니다.");
  let value;
  try { value = JSON.parse(Buffer.from(pieces[0], "base64url").toString()); } catch { throw new Error("접근 정보가 올바르지 않습니다."); }
  if (!value || value.kind !== kind || !Number.isFinite(value.exp) || value.exp <= now) throw new Error("접근 시간이 만료되었습니다. 다시 시작해 주세요.");
  return value;
}
export function validateDownload(value, qualities) {
  if (!value || typeof value !== "object") throw new Error("화질을 선택해 주세요.");
  const q = qualities.find(q => q.id === value.quality);
  if (!q || !["mp4", "mkv"].includes(value.container) || !["photos", "files"].includes(value.destination)) throw new Error("선택한 화질 또는 저장 형식이 올바르지 않습니다.");
  if (value.destination === "photos" && value.container !== "mp4") throw new Error("사진 앱용 영상은 MP4로 저장해 주세요.");
  return { quality: q.id, container: value.container, destination: value.destination };
}
