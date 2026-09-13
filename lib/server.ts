import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { equalSecret, signToken, verifyToken } from "./core.mjs";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export type Session = { kind: "session"; id: string; exp: number };
export type JobRef = { kind: "job"; id: string; session: string; sandbox: string; created: number; exp: number };
export function configured() {
  return !!(process.env.APP_ACCESS_CODE && process.env.APP_ACCESS_CODE.length >= 12 && process.env.APP_SECRET && process.env.APP_SECRET.length >= 32 &&
    (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) &&
    (process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN || (process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID)));
}
export function secret() { return process.env.APP_SECRET || ""; }
export async function sessionOrNull(): Promise<Session | null> {
  try { return verifyToken((await cookies()).get("clipdown_session")?.value, secret(), "session") as Session; } catch { return null; }
}
export async function requireSession() {
  if (!configured()) throw new HttpError(503, "앱 설정이 아직 완료되지 않았습니다. 배포 안내서를 확인해 주세요.");
  const session = await sessionOrNull();
  if (!session) throw new HttpError(401, "접속 코드를 입력해 잠금을 해제해 주세요.");
  return session;
}
export async function createSession(code: unknown) {
  if (!configured()) throw new HttpError(503, "Vercel 환경 변수와 저장소 연결을 먼저 설정해 주세요.");
  if (!equalSecret(code, process.env.APP_ACCESS_CODE)) {
    await new Promise(resolve => setTimeout(resolve, 350));
    throw new HttpError(401, "접속 코드가 일치하지 않습니다.");
  }
  const value: Session = { kind: "session", id: randomUUID(), exp: Date.now() + 7 * 86400000 };
  (await cookies()).set("clipdown_session", signToken(value, secret()), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 7 * 86400 });
}
export async function requireJob(request: Request): Promise<JobRef> {
  const session = await requireSession();
  let job: JobRef;
  try { job = verifyToken(request.headers.get("X-Job-Token"), secret(), "job") as JobRef; }
  catch { throw new HttpError(410, "이 작업은 만료되었습니다. 새 영상을 확인해 주세요."); }
  if (job.session !== session.id || !/^[a-f0-9-]{36}$/.test(job.id) || job.sandbox !== `clipdown-${job.id}`) throw new HttpError(403, "이 작업에 접근할 수 없습니다.");
  return job;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, "허용되지 않은 요청입니다.");
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  sameOrigin(request);
  if (Number(request.headers.get("content-length") || "0") > 8192) throw new HttpError(413, "입력 내용이 너무 깁니다.");
  const text = await request.text();
  if (text.length > 8192) throw new HttpError(413, "입력 내용이 너무 깁니다.");
  try { const value = JSON.parse(text); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new HttpError(400, "입력 내용을 확인해 주세요."); }
}
export function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store, private" } }); }
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  // Never return provider errors: they can contain presigned upload URLs.
  console.error("ClipDown request failed:", error instanceof Error ? error.name : "UnknownError");
  return json({ error: "서버 작업을 완료하지 못했습니다. Vercel의 Sandbox·Blob 연결과 사용 한도를 확인한 뒤 다시 시도해 주세요." }, 502);
}
