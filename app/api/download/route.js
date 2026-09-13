import ytdl from "@distube/ytdl-core";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { PassThrough, Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

ffmpeg.setFfmpegPath(ffmpegPath);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const itag = searchParams.get("itag");

  if (!url || !ytdl.validateURL(url)) {
    return Response.json(
      { error: "유효한 유튜브 링크를 입력해 주세요." },
      { status: 400 }
    );
  }

  try {
    const info = await ytdl.getInfo(url);
    const safeTitle = info.videoDetails.title
      .replace(/[\\/:*?"<>|]/g, "_")
      .slice(0, 100);

    if (itag === "mp3") {
      const audioFormat = ytdl.chooseFormat(info.formats, {
        quality: "highestaudio",
        filter: "audioonly",
      });

      if (!audioFormat) {
        return Response.json(
          { error: "오디오를 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const audioStream = ytdl.downloadFromInfo(info, { format: audioFormat });
      const output = new PassThrough();

      ffmpeg(audioStream)
        .audioBitrate(192)
        .format("mp3")
        .on("error", () => output.destroy())
        .pipe(output, { end: true });

      const webStream = Readable.toWeb(output);

      return new Response(webStream, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(
            safeTitle
          )}.mp3"`,
        },
      });
    }

    const format = itag
      ? info.formats.find((f) => String(f.itag) === String(itag))
      : ytdl.chooseFormat(info.formats, { quality: "highest" });

    if (!format) {
      return Response.json(
        { error: "요청한 화질을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const ext = format.container || "mp4";
    const nodeStream = ytdl.downloadFromInfo(info, { format });
    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream, {
      headers: {
        "Content-Type": format.mimeType?.split(";")[0] || "video/mp4",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          safeTitle
        )}.${ext}"`,
      },
    });
  } catch (err) {
    return Response.json(
      { error: "다운로드 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
