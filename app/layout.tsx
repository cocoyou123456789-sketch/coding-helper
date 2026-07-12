import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://cocoyou123456789-sketch.github.io/coding-helper";
const isNativeApp = process.env.NEXT_PUBLIC_NATIVE_APP === "true";

const webMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "题解簿｜LeetCode Hot 100 小白学习工作台",
  description: "浅粉色算法学习手账：选难度、学题型、写代码、运行测试并记录逐行笔记。",
  applicationName: "题解簿",
  manifest: `${siteUrl}/manifest.webmanifest`,
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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
    description: "像写学习手账一样掌握 LeetCode Hot 100：小课、完整练习、代码测试和逐行笔记。",
    type: "website",
    locale: "zh_CN",
    url: siteUrl,
    siteName: "题解簿",
    images: [
      {
        url: `${siteUrl}/og.png`,
        width: 1728,
        height: 900,
        alt: "题解簿 LeetCode Hot 100 学习工作台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "题解簿｜LeetCode Hot 100",
    description: "选难度、学题型、写代码、做测试，再把思路记下来。",
    images: [`${siteUrl}/og.png`],
  },
};

const nativeMetadata: Metadata = {
  title: "题解簿｜算法学习手账",
  description: "在设备本地选难度、学题型、写 Python、运行测试并记录逐行笔记。",
  applicationName: "题解簿",
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const metadata: Metadata = isNativeApp ? nativeMetadata : webMetadata;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#b94368",
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
