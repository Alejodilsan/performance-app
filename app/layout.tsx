import type { Metadata } from "next";
import { Inter, Montserrat, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Inter para textos y tablas; Montserrat (la del logo) para títulos y cifras
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["500", "600", "700", "800", "900"] });
// Plus Jakarta Sans: tipografía oficial del logotipo (solo para la marca)
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["700", "800"] });

export const metadata: Metadata = {
  title: "AlemiaHR",
  description: "AlemiaHR · Performance Platform: desempeño, desarrollo y talento.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${montserrat.variable} ${jakarta.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
