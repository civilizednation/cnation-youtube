import { Sandbox } from "@vercel/sandbox";
import { BlobNotFoundError, del, get, issueSignedToken, list, presignUrl } from "@vercel/blob";
import type { JobRef } from "./server";
import type { JobState } from "./types";

export const WORK = "/tmp/clipdown";
export const MAX_BYTES = 500 * 1024 * 1024;
export function credentials() {
  if (process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID)
    return { token: process.env.VERCEL_TOKEN, teamId: process.env.VERCEL_TEAM_ID, projectId: process.env.VERCEL_PROJECT_ID };
  return {};
}
export function prefix(job: JobRef) { return `clipdown/${job.session}/${job.id}/`; }
export async function sandboxFor(job: JobRef) { return Sandbox.get({ name: job.sandbox, ...credentials() }); }
export async function readState(sandbox: Sandbox): Promise<JobState | null> {
  const buffer = await sandbox.readFileToBuffer({ path: `${WORK}/state.json` });
  return buffer ? JSON.parse(buffer.toString()) : null;
}
export async function readResult(job: JobRef): Promise<(JobState & { pathname: string }) | null> {
  try {
    const result = await get(`${prefix(job)}result.json`, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    if (result.blob.size > 65536) throw new Error("Invalid result size");
    const state = await new Response(result.stream).json();
    if (!state || state.phase !== "complete" || ![`${prefix(job)}video.mp4`, `${prefix(job)}video.mkv`].includes(state.pathname)) throw new Error("Invalid result");
    return state;
  } catch (e) { if (e instanceof BlobNotFoundError) return null; throw e; }
}
export async function uploadUrl(pathname: string, contentType: string, maxBytes: number) {
  const validUntil = Date.now() + 40 * 60000;
  const token = await issueSignedToken({ pathname, operations: ["put"], validUntil, allowedContentTypes: [contentType], maximumSizeInBytes: maxBytes });
  return (await presignUrl(token, { operation: "put", pathname, access: "private", validUntil, allowedContentTypes: [contentType], maximumSizeInBytes: maxBytes, allowOverwrite: true, addRandomSuffix: false, cacheControlMaxAge: 60 })).presignedUrl;
}
export async function signedRead(pathname: string) {
  const validUntil = Date.now() + 15 * 60000;
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  return (await presignUrl(token, { operation: "get", pathname, access: "private", validUntil })).presignedUrl;
}
export async function deleteFiles(job: JobRef) {
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: prefix(job), cursor, limit: 100 });
    if (page.blobs.length) await del(page.blobs.map(blob => blob.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}
