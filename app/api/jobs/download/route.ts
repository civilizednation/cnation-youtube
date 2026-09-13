import { randomUUID } from "node:crypto";
import { validateDownload } from "@/lib/core.mjs";
import { body, failure, HttpError, json, requireJob } from "@/lib/server";
import { MAX_BYTES, prefix, readState, sandboxFor, uploadUrl, WORK } from "@/lib/cloud";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const job = await requireJob(request);
    const input = await body(request);
    const sandbox = await sandboxFor(job);
    const state = await readState(sandbox);
    if (state?.phase !== "ready" || !state.video) throw new HttpError(409, "영상 확인이 끝난 뒤 한 번만 다운로드를 시작해 주세요.");
    let selected;
    try { selected = validateDownload(input, state.video.qualities); } catch (e) { throw new HttpError(400, (e as Error).message); }
    const pathname = `${prefix(job)}video.${selected.container}`;
    const [videoUploadUrl, resultUploadUrl] = await Promise.all([
      uploadUrl(pathname, selected.container === "mp4" ? "video/mp4" : "video/x-matroska", MAX_BYTES),
      uploadUrl(`${prefix(job)}result.json`, "application/json", 65536)
    ]);
    const payload = { ...selected, pathname, videoUploadUrl, resultUploadUrl, maxBytes: MAX_BYTES };
    const staged = `${WORK}/request-${randomUUID()}.json`;
    await sandbox.writeFiles([{ path: staged, content: Buffer.from(JSON.stringify(payload)) }]);
    const command = await sandbox.runCommand("python3", [`${WORK}/control.py`, staged]);
    if (command.exitCode !== 0) throw new HttpError(409, "이미 시작된 다운로드입니다. 잠시 기다려 주세요.");
    return json({ ok: true }, 202);
  } catch (e) { return failure(e); }
}
