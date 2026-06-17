import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CET 试题对练系统",
  description: "四级真题 + AI 仿真练习 · 行内作答 · AI 批改与能力报告",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
