import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://cocoyou123456789-sketch.github.io/coding-helper";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "题解簿｜LeetCode Hot 100 小白学习工作台",
  description: "用每日小课、极速抢答、算法闪卡和代码挑战，循序渐进学习 LeetCode Hot 100。",
  applicationName: "题解簿",
  manifest: `${siteUrl}/manifest.webmanifest`,
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "题解簿",
  },
  icons: {
    icon: [
      { url: `${siteUrl}/favicon.png`, type: "image/png", sizes: "32x32" },
      { url: `${siteUrl}/icons/icon-192.png`, type: "image/png", sizes: "192x192" },
    ],
    shortcut: `${siteUrl}/favicon.png`,
    apple: [{ url: `${siteUrl}/icons/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#15231f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
