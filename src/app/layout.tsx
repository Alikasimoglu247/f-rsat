import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: "FırsatRadar AI — Kanıta dayalı fırsat keşfi",
  description:
    "Marmara emlak ve ikinci el araç piyasasında ilanları takip edin, benzer istenen fiyatları karşılaştırın.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
