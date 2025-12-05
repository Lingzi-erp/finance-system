import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Toaster as ShadcnToaster } from "@/components/ui/toaster";
import { Navbar } from "@/components/layout/Navbar";

export const metadata: Metadata = {
  title: "财务报表系统",
  description: "一个轻量级的私有财务报表管理系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <body className="font-sans">
        <div className="min-h-screen bg-paper-white">
          <Navbar />
          <main>{children}</main>
        </div>
        <Toaster 
          position="top-right" 
          toastOptions={{
            duration: 4000,
            success: {
              duration: 3000,
            },
            error: {
              duration: 5000,
            },
          }}
        />
        <ShadcnToaster />
      </body>
    </html>
  );
}
