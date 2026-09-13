# cnation Youtube Downloader

유튜브 링크를 입력하면 원하는 해상도로 영상을 저장할 수 있는 모바일 친화적 웹앱입니다.

## 실행 방법

```bash
npm install
npm run dev
```

## 배포 (Vercel)

Vercel에 이 저장소를 연결하면 Next.js 프로젝트로 자동 인식되어 빌드/배포됩니다.

**중요: 배포 전에 Vercel 프로젝트 Settings → Environment Variables에 아래 값을 반드시 추가해 주세요.**

| 이름 | 값 | 설명 |
| --- | --- | --- |
| `GITHUB_TOKEN` | GitHub 개인 액세스 토큰 (권한/스코프 없이 생성 가능) | 빌드 시 `yt-dlp` 실행 파일을 GitHub Releases에서 내려받는데, 토큰이 없으면 IP당 시간당 60회로 제한되어 있는 GitHub API 요청 한도에 걸려 빌드가 실패할 수 있습니다. 토큰을 넣으면 5,000회로 늘어나 안정적으로 빌드됩니다. |

토큰 발급: GitHub → Settings → Developer settings → Personal access tokens → Generate new token (Fine-grained, 아무 리포지토리 권한도 선택하지 않아도 됩니다) → 생성된 값을 위 환경 변수에 붙여넣기 → 재배포.

## 기능

- 유튜브 링크 입력 → 해상도별 mp4 다운로드 (고화질 영상은 서버에서 영상/오디오를 자동 병합)
- 음악 파일(mp3) 다운로드
- 내부적으로 [`yt-dlp`](https://github.com/yt-dlp/yt-dlp)를 사용해 유튜브 정보를 조회하고 다운로드합니다 (활발히 유지보수되는 프로젝트라 유튜브 정책 변경에 비교적 빠르게 대응합니다).

## 참고 사항

- 본인이 저작권을 보유했거나 다운로드가 허용된 영상만 저장해 주세요.
- 유튜브 정책 변경으로 인해 영상 정보 조회나 다운로드가 일시적으로 실패할 수 있습니다.
- 다운로드/변환은 Vercel 서버리스 함수의 최대 실행 시간(현재 60초) 안에 끝나야 합니다. 아주 길거나 고화질인 영상은 시간 초과로 실패할 수 있습니다.
