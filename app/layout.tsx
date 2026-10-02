import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Documentos Plus | Gestión de Archivo",
  description: "Sistema de gestión de archivo para delegaciones y partes policiales.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
