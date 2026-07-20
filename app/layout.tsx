import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://cocoyou123456789-sketch.github.io/coding-helper";
const isNativeApp = process.env.NEXT_PUBLIC_NATIVE_APP === "true";

const webMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "题解簿｜LeetCode Hot 100 小白学习工作台",
  description: "浅粉色算法学习手账：自动解释代码层级、逐行动画、运行测试并记录错题笔记。",
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
    description: "从外到内看懂每层代码，再用真实逐行动画、测试和错题复盘掌握 LeetCode Hot 100。",
    type: "website",
    locale: "zh_CN",
    url: siteUrl,
    siteName: "题解簿",
    images: [
      {
        url: `${siteUrl}/og-code-layers.png`,
        width: 1731,
        height: 909,
        alt: "题解簿代码分层解释与逐行动画学习工作台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "题解簿｜LeetCode Hot 100",
    description: "从外到内看懂代码层级，再逐行运行、做测试并复盘错题。",
    images: [`${siteUrl}/og-code-layers.png`],
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
