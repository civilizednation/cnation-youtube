import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YT_URL_RE = /^(https?:\/\/)?([\w-]+\.)?(youtube\.com|youtu\.be)\//i;
const YT_DLP_PATH = path.join(/* turbopackIgnore: true */ process.cwd(), "bin", "yt-dlp");

function fetchInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      url,
      "--dump-single-json",
      "--no-warnings",
      "--no-check-certificate",
      "--prefer-free-formats",
      "--no-playlist",
      // These clients don't require a proof-of-origin token, unlike the
      // default web client, which YouTube bot-walls from datacenter IPs.
      "--extractor-args",
      "youtube:player_client=tv_simply,tv,web_embedded,ios,android_vr",
      "--extractor-retries",
      "3",
      "--ffmpeg-location",
      ffmpegPath,
    ];

    // YouTube bot-walls datacenter IPs regardless of client or flags, so a
    // residential proxy is the only server-side way through.
    if (process.env.YTDLP_PROXY) {
      args.push("--proxy", process.env.YTDLP_PROXY);
    }
    const child = spawn(YT_DLP_PATH, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.slice(-1500) || `yt-dlp exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`JSON parse failed: ${stdout.slice(-500)}`));
      }
    });
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !YT_URL_RE.test(url)) {
    return Response.json(
      { error: "유효한 유튜브 링크를 입력해 주세요." },
      { status: 400 }
    );
  }

  try {
    const info = await fetchInfo(url);

    const videoFormats = (info.formats || []).filter(
      (f) => f.vcodec && f.vcodec !== "none" && f.ext === "mp4" && f.height
    );

    const seen = new Set();
    const uniqueFormats = [];
    for (const f of videoFormats.sort(
      (a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0)
    )) {
      if (seen.has(f.height)) continue;
      seen.add(f.height);
      uniqueFormats.push({
        itag: f.format_id,
        quality: `${f.height}p`,
        container: "mp4",
        contentLength: f.filesize || f.filesize_approx || null,
        muxed: !!(f.acodec && f.acodec !== "none"),
      });
    }

    const hasAudio = (info.formats || []).some(
      (f) => f.acodec && f.acodec !== "none"
    );
    const audioFormats = hasAudio
      ? [
          {
            itag: "mp3",
            quality: "음악 파일 (mp3)",
            container: "mp3",
            contentLength: null,
            muxed: true,
          },
        ]
      : [];

    if (!uniqueFormats.length && !audioFormats.length) {
      return Response.json(
        { error: "다운로드 가능한 화질을 찾지 못했습니다." },
        { status: 404 }
      );
    }

    return Response.json({
      title: info.title,
      thumbnail: info.thumbnail || null,
      duration: info.duration,
      formats: [...uniqueFormats, ...audioFormats],
    });
  } catch (err) {
    console.error("yt-dlp info failed:", err);
    const detail = (err?.message || "").toString().slice(-800);
    return Response.json(
      {
        error: "영상 정보를 가져오지 못했습니다. 링크를 확인해 주세요.",
        detail,
      },
      { status: 500 }
    );
  }
}
