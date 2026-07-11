import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://cocoyou123456789-sketch.github.io/coding-helper";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "题解簿｜LeetCode Hot 100 小白学习工作台",
  description: "用每日小课、极速抢答、算法闪卡和代码挑战，循序渐进学习 LeetCode Hot 100。",
  applicationName: "题解簿",
  icons: {
    icon: `${siteUrl}/favicon.svg`,
    shortcut: `${siteUrl}/favicon.svg`,
  },
  openGraph: {
    title: "题解簿｜LeetCode Hot 100",
    description: "每日小课、极速抢答、算法闪卡、代码测试——为算法小白设计的游戏化学习路径。",
    type: "website",
    locale: "zh_CN",
    url: siteUrl,
    siteName: "题解簿",
    images: [
      {
        url: `${siteUrl}/og.png`,
        width: 1728,
        height: 907,
        alt: "题解簿 LeetCode Hot 100 学习工作台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "题解簿｜LeetCode Hot 100",
    description: "用小课、抢答和闪卡学习 LeetCode Hot 100。",
    images: [`${siteUrl}/og.png`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
