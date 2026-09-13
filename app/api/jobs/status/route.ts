import { failure, json, requireJob } from "@/lib/server";
import { readResult, readState, sandboxFor } from "@/lib/cloud";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: Request) {
  try {
    const job = await requireJob(request);
    const result = await readResult(job);
    if (result) {
      // Stop compute on first completed poll; result remains in private Blob storage.
      try { const sandbox = await sandboxFor(job); if (sandbox.status === "running") await sandbox.stop(); } catch {}
      if (!result.expiresAt || result.expiresAt < Date.now()) return json({ phase: "failed", message: "저장 시간이 만료되었습니다. 영상을 다시 준비해 주세요." });
      const { pathname: _pathname, ...publicState } = result;
      return json(publicState);
    }
    try {
      const sandbox = await sandboxFor(job);
      if (["stopped", "failed"].includes(sandbox.status)) return json({ phase: "failed", message: "작업 시간이 만료되었거나 취소되었습니다. 처음부터 다시 시도해 주세요." });
      const state = await readState(sandbox);
      if (state?.phase === "failed") await sandbox.stop().catch(() => {});
      return json(state || { phase: "preparing", message: "처리 준비 중입니다." });
    } catch {
      if (Date.now() - job.created > 30 * 60000) return json({ phase: "failed", message: "작업 시간이 만료되었습니다. 더 짧은 영상이나 낮은 화질로 다시 시도해 주세요." });
      throw new Error("Sandbox unreachable");
    }
  } catch (e) { return failure(e); }
}
