import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SGC Scribe — Транскрипция совещаний",
  description: "Внутренняя система транскрипции и AI-анализа для Сибирской Генерирующей Компании",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
