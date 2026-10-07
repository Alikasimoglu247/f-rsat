import { useEffect, useRef, useState } from 'react';
import { categories, currency, deals, discount } from './deals';
import type { Category, Deal } from './deals';

const storageKey = 'f-rsat:favorites';
function Arrow() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" /></svg>;
}
function readFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && deals.some(deal => deal.id === id)) : [];
  } catch { return []; }
}

export default function App() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('Tümü');
  const [sort, setSort] = useState('featured');
  const [favorites, setFavorites] = useState(readFavorites);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selected, setSelected] = useState<Deal | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(favorites)); setStorageWarning(false); }
    catch { setStorageWarning(true); }
  }, [favorites]);

  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);

  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');
  const visibleDeals = deals.filter(deal =>
    (category === 'Tümü' || deal.category === category) &&
    (!onlyFavorites || favorites.includes(deal.id)) &&
    `${deal.title} ${deal.category}`.toLocaleLowerCase('tr-TR').includes(normalizedQuery),
  ).sort((a, b) => sort === 'price' ? a.price - b.price : sort === 'discount' ? discount(b) - discount(a) : 0);

  function toggleFavorite(id: string) {
    setFavorites(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  function resetFilters() {
    setQuery(''); setCategory('Tümü'); setOnlyFavorites(false); setSort('featured');
  }

  return (
    <>
      <a className="skip-link" href="#firsatlar">İçeriğe geç</a>
      <header className="header">
        <a className="brand" href="#" onClick={resetFilters} aria-label="Fırsat ana sayfa"><span className="brand-icon">f.</span>fırsat<span className="brand-dot">.</span></a>
        <nav aria-label="Ana menü">
          <button className={!onlyFavorites ? 'nav-button active' : 'nav-button'} onClick={() => setOnlyFavorites(false)} aria-pressed={!onlyFavorites}>Keşfet</button>
          <button className={onlyFavorites ? 'nav-button active' : 'nav-button'} onClick={() => setOnlyFavorites(true)} aria-pressed={onlyFavorites}>Favorilerim <span className="count">{favorites.length}</span></button>
        </nav>
      </header>
      <main className="container">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow">AKILLI ALIŞVERİŞİN BAŞLANGICI</span>
            <h1 id="hero-title">İyi şeyler.<br /><span>Daha iyi fiyatlar.</span></h1>
            <p>İlgini çeken fırsatları keşfet, karşılaştır ve sonra bakmak için kaydet. Hepsi bir arada.</p>
            <a className="hero-link" href="#firsatlar">Fırsatları keşfet <Arrow /></a>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="shopping-bag"><span>f.</span></div>
            <span className="floating-tag">Daha az öde.<br /><strong>Daha çok keşfet.</strong></span>
            <span className="spark spark-one">✦</span><span className="spark spark-two">✦</span>
          </div>
        </section>
        <div className="demo-note"><span aria-hidden="true">ⓘ</span> Örnek fırsatlar gösteriliyor. Fiyatlar ve ürünler tanıtım amaçlıdır.</div>
        <section id="firsatlar" aria-labelledby="deals-title">
          <div className="section-heading"><div><span className="eyebrow">KEŞFETMEYE DEĞER</span><h2 id="deals-title">{onlyFavorites ? 'Favori fırsatların' : 'Senin için seçtiklerimiz'}</h2></div><span className="results" role="status">{visibleDeals.length} fırsat</span></div>
          <div className="toolbar">
            <label className="search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Fırsat ara" placeholder="Ne arıyorsun?" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <label className="sort">Sıralama<select value={sort} onChange={event => setSort(event.target.value)}><option value="featured">Öne çıkanlar</option><option value="price">Fiyat: düşükten yükseğe</option><option value="discount">En yüksek indirim</option></select></label>
          </div>
          <div className="categories" aria-label="Kategoriler">{categories.map(item => <button key={item} className={category === item ? 'category selected' : 'category'} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
          {storageWarning && <p role="status" className="demo-note">Tarayıcı depolaması kullanılamıyor. Favorilerin yalnızca bu oturumda saklanacak.</p>}
          <div className="deal-grid">
            {visibleDeals.map(deal => <article className="deal-card" key={deal.id}>
              <div className={`product-visual ${deal.color}`}>
                <span className="discount">%{discount(deal)} indirim</span>
                <button className={favorites.includes(deal.id) ? 'favorite saved' : 'favorite'} aria-label={`${deal.title} ${favorites.includes(deal.id) ? 'favorilerden çıkar' : 'favorilere ekle'}`} aria-pressed={favorites.includes(deal.id)} onClick={() => toggleFavorite(deal.id)}>{favorites.includes(deal.id) ? '♥' : '♡'}</button>
                <span className="product-icon" role="img" aria-label={deal.title}>{deal.icon}</span>
              </div>
              <div className="card-body"><span className="product-category">{deal.category}</span><h3>{deal.title}</h3><p className="merchant">Örnek Mağaza</p><div className="card-bottom"><div className="price"><del>{currency(deal.originalPrice)}</del><strong>{currency(deal.price)}</strong></div><button className="details-button" aria-label={`${deal.title} detaylarını gör`} onClick={() => setSelected(deal)}>İncele <Arrow /></button></div></div>
            </article>)}
          </div>
          {visibleDeals.length === 0 && <div className="empty-state"><span aria-hidden="true">⌕</span><h3>{onlyFavorites ? 'Burada henüz bir fırsat yok' : 'Aradığın fırsatı bulamadık'}</h3><p>{onlyFavorites ? 'Fırsatlardaki kalbe dokunarak favori listeni oluşturabilirsin.' : 'Başka bir kelime dene veya filtreleri temizle.'}</p><button className="reset-button" onClick={resetFilters}>Tüm fırsatları göster</button></div>}
        </section>
      </main>
      <footer className="footer"><strong>fırsat.</strong><span>Keşfet. Karşılaştır. Kendine sakla.</span><span>Örnek uygulama</span></footer>
      <dialog ref={dialog} className="deal-dialog" aria-labelledby="dialog-title" onClose={() => setSelected(null)}>
        {selected && <><button className="dialog-close" aria-label="Detayı kapat" onClick={() => dialog.current?.close()}>×</button><span className={`dialog-icon ${selected.color}`} aria-hidden="true">{selected.icon}</span><span className="product-category">{selected.category}</span><h2 id="dialog-title">{selected.title}</h2><p>{selected.description}</p><div className="dialog-price"><strong>{currency(selected.price)}</strong><del>{currency(selected.originalPrice)}</del></div><p className="demo-note">Bu ürün örnektir. Satın alma bağlantısı bulunmuyor.</p><button className="reset-button" aria-pressed={favorites.includes(selected.id)} onClick={() => toggleFavorite(selected.id)}>{favorites.includes(selected.id) ? 'Favorilerden çıkar' : 'Favorilere ekle'}</button></>}
      </dialog>
    </>
  );
}
