import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "타임잇 | 공부가 쌓이는 나만의 페이지",
  description: "플래너, 집중 타이머, 공부 통계를 한 곳에 담은 모바일 스터디 앱 타임잇.",
  applicationName: "타임잇",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "타임잇", statusBarStyle: "default" },
  openGraph: {
    title: "타임잇 | 공부가 쌓이는 나만의 페이지",
    description: "플래너, 집중 타이머, 공부 통계를 한 곳에 담은 모바일 스터디 앱 타임잇.",
    type: "website",
    locale: "ko_KR",
    images: [{ url: "/og.png", width: 1792, height: 944, alt: "타임잇 공부 플래너" }],
  },
  twitter: { card: "summary_large_image", title: "타임잇", description: "공부가 쌓이는 나만의 페이지", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
