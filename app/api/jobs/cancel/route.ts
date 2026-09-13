import { failure, json, requireJob, sameOrigin } from "@/lib/server";
import { deleteFiles, sandboxFor } from "@/lib/cloud";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    sameOrigin(request); const job = await requireJob(request);
    try { const sandbox = await sandboxFor(job); if (!["stopped", "failed"].includes(sandbox.status)) await sandbox.stop(); }
    catch (e) { if ((e as { response?: Response }).response?.status !== 404 && Date.now() - job.created < 31 * 60000) throw e; }
    await deleteFiles(job); return json({ ok: true });
  } catch (e) { return failure(e); }
}
