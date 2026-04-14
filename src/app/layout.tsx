import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yomu",
  description: "AI-powered self-hosted RSS reader",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2dd4bf" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker"in navigator&&location.hostname!=="localhost"){navigator.serviceWorker.register("/sw.js")}`,
          }}
        />
      </body>
    </html>
  );
}
