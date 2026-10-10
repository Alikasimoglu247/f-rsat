"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Radar,
  LayoutDashboard,
  ScanSearch,
  ChartNoAxesCombined,
  Bookmark,
  Database,
  Bell,
  Settings,
  Moon,
  Sun,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "./ui/button";
const links = [
  { href: "/", label: "Genel Bakış", icon: LayoutDashboard },
  {
    href: "/yatirim-analizi",
    label: "Yatırım Analizi",
    icon: ChartNoAxesCombined,
  },
  { href: "/yeni-ilanlar", label: "Yeni İlanlar", icon: Database },
  { href: "/firsatlar", label: "Fırsatlar", icon: ScanSearch },
  { href: "/fiyat-gecmisi", label: "Fiyat Geçmişi", icon: ChartNoAxesCombined },
  { href: "/takip-listem", label: "Takip Listem", icon: Bookmark },
  { href: "/veri-kaynaklari", label: "Veri Kaynakları", icon: Database },
  { href: "/bildirimler", label: "Bildirimler", icon: Bell },
  { href: "/ayarlar", label: "Ayarlar", icon: Settings },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    try {
      const active = localStorage.getItem("radar:theme") === "dark";
      setDark(active);
      document.documentElement.classList.toggle("dark", active);
    } catch {}
  }, []);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("radar:theme", next ? "dark" : "light");
    } catch {}
  }
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        İçeriğe geç
      </a>
      <aside className="sidebar">
        <Link href="/" className="logo">
          <span className="logo-mark">
            <Radar size={25} />
          </span>
          <span>
            FırsatRadar <small>AI</small>
          </span>
        </Link>
        <div className="workspace">
          <span className="avatar">K</span>
          <div>
            <strong>Kişisel çalışma alanı</strong>
            <span>Marmara Bölgesi</span>
          </div>
          <span className="workspace-dot" />
        </div>
        <div className="nav-label">ÇALIŞMA ALANI</div>
        <nav aria-label="Ana menü">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={
                (href === "/" ? path === "/" : path.startsWith(href))
                  ? "nav-link current"
                  : "nav-link"
              }
              aria-current={
                (href === "/" ? path === "/" : path.startsWith(href))
                  ? "page"
                  : undefined
              }
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="trust-card">
            <ShieldCheck size={20} />
            <strong>Kararların kanıta dayansın.</strong>
            <p>
              İstenen fiyatları karşılaştır. Belirsizlikleri gör. Kontrol sende
              kalsın.
            </p>
          </div>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-pressed={dark}
            aria-label="Koyu tema"
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}{" "}
            {dark ? "Açık görünüm" : "Koyu görünüm"}
          </button>
          <span className="sidebar-caption">Kişisel analiz · v0.1</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="region-pill">
            <span />
            Marmara, Türkiye
          </span>
          <div className="topbar-actions">
            <Link href="/veri-kaynaklari" className="topbar-source">
              Kaynakları yönet <ArrowUpRight size={14} />
            </Link>
            <Link
              href="/bildirimler"
              className="icon-link"
              aria-label="Bildirimleri aç"
            >
              <Bell size={19} />
            </Link>
            <span className="avatar small">K</span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          İstenen fiyat analizi. Ekspertiz, doğrulanmış satış değeri veya
          yatırım tavsiyesi değildir.
        </footer>
        <Button
          className="mobile-theme"
          size="icon"
          variant="outline"
          onClick={toggleTheme}
          aria-label="Temayı değiştir"
        >
          {dark ? <Sun /> : <Moon />}
        </Button>
      </div>
    </div>
  );
}
