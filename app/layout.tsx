import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Geist, DM_Serif_Display } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Quizzly — Quiz Hosting Platform",
  description:
    "A hosted quiz engine for organisations that run assessments, competitions, and screening tests.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", geist.variable, dmSerif.variable)}
    >
      <body className="min-h-screen antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
