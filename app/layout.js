export const metadata = {
  title: "cnation Youtube Downloader",
  description: "유튜브 링크를 입력하고 원하는 해상도로 저장하세요.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
