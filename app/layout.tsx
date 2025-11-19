import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MultiMediaSaver - Media Downloader",
  description: "Download images and videos from Twitter/X and Instagram",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

