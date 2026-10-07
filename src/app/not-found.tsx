import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Sayfa bulunamadı</h1>
      <Link href="/">Genel bakışa dön</Link>
    </div>
  );
}
