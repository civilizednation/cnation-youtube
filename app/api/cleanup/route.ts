import { del, list } from "@vercel/blob";
import { equalSecret } from "@/lib/core.mjs";
import { failure, json } from "@/lib/server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !equalSecret(request.headers.get("authorization"), `Bearer ${process.env.CRON_SECRET}`)) return json({ error: "Unauthorized" }, 401);
  try {
    let cursor: string | undefined; let deleted = 0;
    do {
      const page = await list({ prefix: "clipdown/", cursor, limit: 1000 });
      // Retain for 25h from upload; daily cron normally deletes within 25–49h.
      const expired = page.blobs.filter(blob => Date.now() - blob.uploadedAt.getTime() > 25 * 3600000);
      if (expired.length) { await del(expired.map(blob => blob.url)); deleted += expired.length; }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return json({ deleted });
  } catch (e) { return failure(e); }
}
