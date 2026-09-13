import { failure, HttpError, json, requireJob, sameOrigin } from "@/lib/server";
import { readResult, signedRead } from "@/lib/cloud";
import { getDownloadUrl } from "@vercel/blob";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    sameOrigin(request); const job = await requireJob(request);
    const result = await readResult(job);
    if (!result || !result.expiresAt || result.expiresAt < Date.now()) throw new HttpError(410, "파일이 아직 준비되지 않았거나 만료되었습니다.");
    return json({ url: getDownloadUrl(await signedRead(result.pathname)), filename: result.filename });
  } catch (e) { return failure(e); }
}
