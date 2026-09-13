import ytdl from "@distube/ytdl-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !ytdl.validateURL(url)) {
    return Response.json(
      { error: "유효한 유튜브 링크를 입력해 주세요." },
      { status: 400 }
    );
  }

  try {
    const info = await ytdl.getInfo(url);

    const formats = info.formats.filter(
      (f) => f.hasVideo && f.hasAudio && f.container === "mp4" && f.qualityLabel
    );

    const seen = new Set();
    const uniqueFormats = [];
    for (const f of formats.sort(
      (a, b) => parseInt(b.qualityLabel) - parseInt(a.qualityLabel)
    )) {
      if (seen.has(f.qualityLabel)) continue;
      seen.add(f.qualityLabel);
      uniqueFormats.push({
        itag: f.itag,
        quality: f.qualityLabel,
        container: f.container,
        contentLength: f.contentLength ? Number(f.contentLength) : null,
      });
    }

    const thumbnails = info.videoDetails.thumbnails || [];

    const hasAudio = info.formats.some((f) => f.hasAudio);
    const audioFormats = hasAudio
      ? [
          {
            itag: "mp3",
            quality: "음악 파일 (mp3)",
            container: "mp3",
            contentLength: null,
          },
        ]
      : [];

    return Response.json({
      title: info.videoDetails.title,
      thumbnail: thumbnails[thumbnails.length - 1]?.url || null,
      duration: info.videoDetails.lengthSeconds,
      formats: [...uniqueFormats, ...audioFormats],
    });
  } catch (err) {
    return Response.json(
      { error: "영상 정보를 가져오지 못했습니다. 링크를 확인해 주세요." },
      { status: 500 }
    );
  }
}
