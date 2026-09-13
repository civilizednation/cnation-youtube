import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "cnation 유투브 다운로더", description: "유튜브 링크를 입력하고 원하는 해상도로 영상을 저장하세요.",
  manifest: "/manifest.webmanifest", icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "cnation 유투브 다운로더", statusBarStyle: "black-translucent" }
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#11151c" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
