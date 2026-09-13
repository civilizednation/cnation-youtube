import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import { createReadStream, existsSync } from "fs";
import { unlink, stat } from "fs/promises";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import { Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const YT_URL_RE = /^(https?:\/\/)?([\w-]+\.)?(youtube\.com|youtu\.be)\//i;
const YT_DLP_PATH = path.join(/* turbopackIgnore: true */ process.cwd(), "bin", "yt-dlp");

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(YT_DLP_PATH, args);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-2000) || `yt-dlp exited with ${code}`));
    });
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const itag = searchParams.get("itag");
  const muxed = searchParams.get("muxed") === "1";
  const rawTitle = searchParams.get("title") || "download";

  if (!url || !YT_URL_RE.test(url)) {
    return Response.json(
      { error: "유효한 유튜브 링크를 입력해 주세요." },
      { status: 400 }
    );
  }

  const isAudio = itag === "mp3";
  const ext = isAudio ? "mp3" : "mp4";
  const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100) || "download";
  const id = randomUUID();
  const tmpDir = os.tmpdir();
  const outputTemplate = path.join(/* turbopackIgnore: true */ tmpDir, `${id}.%(ext)s`);
  const finalPath = path.join(/* turbopackIgnore: true */ tmpDir, `${id}.${ext}`);

  const args = [
    url,
    "-o",
    outputTemplate,
    "--ffmpeg-location",
    ffmpegPath,
    "--no-playlist",
    "--no-warnings",
    "--no-part",
    // Same non-PO-token clients as /api/info, so both calls see the same formats.
    "--extractor-args",
    "youtube:player_client=tv_simply,tv,web_embedded,ios,android_vr",
    "--extractor-retries",
    "3",
  ];

  if (process.env.YTDLP_PROXY) {
    args.push("--proxy", process.env.YTDLP_PROXY);
  }

  if (isAudio) {
    args.push("-f", "bestaudio/best", "-x", "--audio-format", "mp3");
  } else if (itag) {
    const selector = muxed ? itag : `${itag}+bestaudio/${itag}/best`;
    args.push("-f", selector, "--merge-output-format", "mp4");
  } else {
    args.push("-f", "bestvideo+bestaudio/best", "--merge-output-format", "mp4");
  }

  try {
    await runYtDlp(args);

    if (!existsSync(finalPath)) {
      return Response.json(
        { error: "다운로드된 파일을 찾을 수 없습니다." },
        { status: 500 }
      );
    }

    const fileStat = await stat(finalPath);
    const nodeStream = createReadStream(finalPath);
    nodeStream.on("close", () => {
      unlink(finalPath).catch(() => {});
    });

    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream, {
      headers: {
        "Content-Type": isAudio ? "audio/mpeg" : "video/mp4",
        "Content-Length": String(fileStat.size),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          safeTitle
        )}.${ext}"`,
      },
    });
  } catch (err) {
    unlink(finalPath).catch(() => {});
    console.error("yt-dlp download failed:", err);
    const detail = (err?.message || "").toString().slice(-800);
    return Response.json(
      { error: "다운로드 중 오류가 발생했습니다.", detail },
      { status: 500 }
    );
  }
}
