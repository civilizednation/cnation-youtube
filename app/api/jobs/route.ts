import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { normalizeYouTube, signToken } from "@/lib/core.mjs";
import { body, failure, HttpError, json, requireSession, secret, type JobRef } from "@/lib/server";
import { credentials, WORK } from "@/lib/cloud";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  let sandbox: Sandbox | undefined;
  try {
    const session = await requireSession();
    const input = await body(request);
    let url: string;
    try { url = normalizeYouTube(input.url); } catch (e) { throw new HttpError(400, (e as Error).message); }
    const id = randomUUID();
    const job: JobRef = { kind: "job", id, session: session.id, sandbox: `clipdown-${id}`, created: Date.now(), exp: Date.now() + 26 * 3600000 };
    sandbox = await Sandbox.create({ name: job.sandbox, image: process.env.SANDBOX_IMAGE || "vercel/sandbox/universal", persistent: false, timeout: 30 * 60000, resources: { vcpus: 2 }, tags: { app: "clipdown", session: session.id }, ...credentials() });
    const files = await Promise.all(["bootstrap.py", "worker.py", "control.py", "requirements.txt"].map(async name => ({ path: `${WORK}/${name}`, content: await readFile(path.join(process.cwd(), "worker", name)) })));
    await sandbox.writeFiles([...files, { path: `${WORK}/input.json`, content: Buffer.from(JSON.stringify({ url, created: job.created })) }, { path: `${WORK}/state.json`, content: Buffer.from(JSON.stringify({ phase: "preparing", message: "영상 처리 도구를 준비하고 있어요. 처음에는 1~3분 정도 걸릴 수 있습니다." })) }]);
    await sandbox.runCommand({ cmd: "python3", args: [`${WORK}/bootstrap.py`], detached: true });
    return json({ token: signToken(job, secret()) }, 202);
  } catch (e) { if (sandbox) await sandbox.stop().catch(() => {}); return failure(e); }
}
