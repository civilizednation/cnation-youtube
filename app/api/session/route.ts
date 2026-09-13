import { body, configured, createSession, failure, json, sessionOrNull } from "@/lib/server";
export const runtime = "nodejs";
export async function GET() { return json({ configured: configured(), authenticated: !!(await sessionOrNull()) }); }
export async function POST(request: Request) { try { await createSession((await body(request)).code); return json({ ok: true }); } catch (e) { return failure(e); } }
