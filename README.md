# cnation 유투브 다운로더

유튜브 링크를 입력하고, 실제 제공되는 해상도를 선택해 소리가 포함된 동영상으로 받는 개인용 웹앱입니다. 같은 주소를 안드로이드·아이폰·컴퓨터에서 사용합니다. 브라우저 제목, 앱 상단, 홈 화면 설치 이름에 **cnation 유투브 다운로더**를 적용했습니다.

**처음이라면 [배포가이드.md](./배포가이드.md)를 먼저 읽어 주세요.**

## 포함된 기능

- 일반 영상·Shorts 링크 확인, 해상도 선택, MP4·MKV 출력
- 사진 앱용 H.264/AAC MP4 변환, 파일 보관용 원본 코덱 유지
- 처리 진행률, 취소, 새로고침 후 현재 작업 복구
- 직접 파일 다운로드, 지원하는 모바일 브라우저의 파일 공유 메뉴
- 홈 화면에 추가할 수 있는 PWA, 인터넷 연결이 끊겼을 때 안내 화면
- 접속 코드, 비공개 임시 저장소, 만료되는 다운로드 주소, 자동 파일 정리

## 배포 구조

GitHub는 소스를 보관하고 Vercel이 웹앱을 실행합니다. 영상 처리에는 **Vercel Sandbox**, 완성 파일에는 **Private Vercel Blob**을 사용합니다. GitHub 연결만으로 다운로드 준비가 끝나지는 않습니다. 저장소 연결과 환경 변수 설정이 필요합니다.

```text
휴대폰 브라우저
  → Vercel Next.js: 접속 확인 / 작업 요청 / 진행 상태
  → Vercel Sandbox: yt-dlp / FFmpeg로 영상과 소리 처리
  → Private Vercel Blob: 완성된 영상 임시 보관
  → 휴대폰: 만료되는 주소로 직접 다운로드
```

큰 동영상이 Vercel 웹 함수의 응답 본문을 통과하지 않도록 구성했습니다. Sandbox는 작업마다 만들어지며 완료 상태 확인 또는 취소 시 중지하고, 최대 30분 후 중지됩니다. 실제 작동은 해당 계정의 Sandbox·Blob 사용 가능 여부와 한도에 영향을 받습니다. [Vercel Sandbox 문서](https://vercel.com/docs/sandbox), [Blob 문서](https://vercel.com/docs/vercel-blob)

## 현재 제한

- 영상 길이 30분 이하, 다운로드한 영상·음성 합계 및 최종 파일 각각 최대 500 MiB(화면에는 MB로 표기)
- 화질 선택 대기 5분, 서버 작업 최대 30분
- 파일 공유용 메모리 적재는 100 MiB 이하만 제공. 더 큰 파일은 직접 다운로드
- 영상별 실제 해상도만 제공하며 같은 해상도에서는 H.264를 우선 선택. 4K가 없는 영상을 4K로 늘리지 않음
- 완성 후 24시간 접근 가능. 정상적인 일일 정리 실행 시 업로드 약 25~49시간 후 실제 삭제
- 재생목록 일괄 다운로드, 진행 중인 라이브, 로그인·추가 인증이 필요한 영상은 지원하지 않음
- YouTube가 데이터센터 IP 요청을 제한하면 공개 영상도 실패할 수 있음. 배포 성공과 모든 영상의 다운로드 성공은 별개
- 웹앱이 사진 보관함에 임의로 직접 저장할 수는 없음. 사용자가 공유 메뉴 또는 파일 앱에서 저장 위치를 선택

다운로드 권한이 있는 영상에 사용하세요. 비용과 사용 한도는 [Vercel의 현재 요금 안내](https://vercel.com/pricing)를 확인하세요.

## 노트북에서 실행

Node.js 24 LTS와 npm을 설치한 뒤 이 폴더에서 실행합니다.

```sh
npm ci
npm run dev
```

브라우저에서 `http://127.0.0.1:3000`을 엽니다. 환경 변수가 없으면 화면을 확인할 수 있지만 다운로드는 잠겨 있습니다. 실제 처리를 연결하려면 `.env.example`을 `.env.local`로 복사하고 배포 가이드의 개발 환경 설정을 따르세요. Vercel에서는 로컬 Python 설치가 필요하지 않습니다. Python 작업 파일은 Sandbox에서 실행됩니다.

```sh
npm run secrets
npm test
npm run typecheck
npm run build
```

`npm run secrets`는 환경 변수에 넣을 새 값을 출력합니다. 이 출력과 `.env.local`은 GitHub에 올리지 마세요. 브라우저 제목은 `app/layout.tsx`, 화면 이름은 `app/page.tsx`, 설치 이름은 `public/manifest.webmanifest`에 있습니다.

## 개발자용 검증

```sh
python -m unittest discover -s tests -p "test_*.py"
```

Python 3.11 이상을 권장합니다. 실제 MP4 변환 검사까지 하려면 `FFMPEG_EXE`, `FFPROBE_EXE`에 해당 실행 파일 경로를 설정하세요. 기본 Python 테스트는 yt-dlp 설치 없이 실행되며 실제 영상 변환 검사는 이 두 변수가 없으면 건너뜁니다.

로컬 웹서버와 Google Chrome을 실행할 수 있는 환경에서 `npm run test:browser`를 실행합니다. Pixel 7·iPhone 13 화면 크기의 Chromium 검사이며 실제 Safari나 실물 휴대폰 검증을 대신하지 않습니다. 자세한 확인 범위는 [검증결과.md](./검증결과.md)에 기록했습니다.

## 소스 구성

| 위치 | 역할 |
| --- | --- |
| `app/` | 모바일 화면, 제목, API |
| `lib/` | 인증, 입력 검사, Sandbox·Blob 연결 |
| `worker/` | Linux 영상 다운로드·변환·업로드 |
| `public/` | 앱 아이콘, 설치 정보, 오프라인 안내 |
| `scripts/` | 접속 코드 생성, 아이콘 재생성 |
| `tests/` | 인증·입력·영상 변환·모바일 화면 검사 |

YouTube·Vercel API 변경에 따른 유지보수가 필요할 수 있습니다. 설치 시점의 의존성은 `package-lock.json`과 `worker/requirements.txt`에 고정했습니다. FFmpeg 등 외부 도구의 라이선스는 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)를 참고하세요.
