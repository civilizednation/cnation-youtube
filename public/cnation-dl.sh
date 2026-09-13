#!/bin/sh
# cnation Youtube Downloader - a-Shell(iOS) 헬퍼 스크립트
# 사용법: sh cnation-dl.sh <유튜브 주소> [1080|720|480|360|mp3]

URL="$1"
QUALITY="${2:-720}"

if [ -z "$URL" ]; then
  echo "사용법: sh cnation-dl.sh <유튜브 주소> [1080|720|480|360|mp3]"
  exit 1
fi

OUTDIR="$HOME/Documents/cnation"
mkdir -p "$OUTDIR"
TEMPLATE="$OUTDIR/%(title).100s.%(ext)s"

if command -v ffmpeg >/dev/null 2>&1; then
  HAS_FFMPEG=1
else
  HAS_FFMPEG=0
fi

if [ "$QUALITY" = "mp3" ]; then
  if [ "$HAS_FFMPEG" = "0" ]; then
    echo "mp3로 저장하려면 ffmpeg가 필요합니다. 설치 안내 페이지의 3단계를 진행해 주세요."
    exit 1
  fi
  echo "[cnation] 음악 파일(mp3)로 저장합니다..."
  yt-dlp --no-playlist --no-warnings -o "$TEMPLATE" \
    -f bestaudio -x --audio-format mp3 "$URL" || exit 1
elif [ "$HAS_FFMPEG" = "1" ]; then
  echo "[cnation] ${QUALITY}p 이하 최고 화질로 저장합니다..."
  yt-dlp --no-playlist --no-warnings -o "$TEMPLATE" \
    -f "bestvideo[height<=$QUALITY]+bestaudio/best[height<=$QUALITY]/best" \
    --merge-output-format mp4 "$URL" || exit 1
else
  # ffmpeg가 없으면 영상과 음성이 이미 합쳐진 포맷만 받을 수 있습니다(보통 720p 이하).
  echo "[cnation] ffmpeg 없음 - 합본 포맷으로 저장합니다(최대 720p)..."
  yt-dlp --no-playlist --no-warnings -o "$TEMPLATE" \
    -f "best[height<=$QUALITY][ext=mp4]/best[ext=mp4]/best" "$URL" || exit 1
fi

echo ""
echo "[cnation] 완료. 저장 위치:"
echo "  파일 앱 > 나의 iPhone > a-Shell > Documents > cnation"
ls -1t "$OUTDIR" | head -3
