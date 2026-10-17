import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DEVİR — İş yarıda kalmasın",
  description: "Yarım kalan agent işlerini tamamlanan ilerleme, kalan bütçe ve görev sınırlarıyla birlikte devret.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
