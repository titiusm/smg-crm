import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Solar Maintenance Guys — Sales CRM",
  description: "Internal CRM and sales platform for The Solar Maintenance Guys.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Prevents a flash of the wrong theme before the provider hydrates.
  const noFlashScript = `
    (function(){
      try {
        var t = localStorage.getItem('smg.theme') || 'dark';
        var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (dark) document.documentElement.classList.add('dark');
      } catch (e) {}
    })();
  `;
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
