import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import { Suspense } from "react";
import { TopBar, TopBarView } from "@/components/top-bar";
import "./globals.css";

const notoSans = Noto_Sans({
  variable: "--font-noto",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ProofMap",
  description:
    "AI code review that gives a named human evidence they can check and own.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${notoSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={<TopBarView session={null} />}>
          <TopBar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
