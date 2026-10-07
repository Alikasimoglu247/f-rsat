export const categories = ['Tümü', 'Teknoloji', 'Ev & Yaşam', 'Moda', 'Spor'] as const;
export type Category = typeof categories[number];

export type Deal = {
  id: string;
  title: string;
  category: Exclude<Category, 'Tümü'>;
  price: number;
  originalPrice: number;
  icon: string;
  color: string;
  description: string;
};

// Tamamı örnek veridir; canlı fiyat veya satın alma bağlantısı içermez.
export const deals: Deal[] = [
  { id: 'kulaklik', title: 'Kablosuz kulaklık', category: 'Teknoloji', price: 1499, originalPrice: 2499, icon: '🎧', color: 'lavender', description: 'Günlük kullanım için hafif tasarım, aktif gürültü engelleme ve uzun pil ömrü.' },
  { id: 'kahve', title: 'Filtre kahve makinesi', category: 'Ev & Yaşam', price: 1899, originalPrice: 2999, icon: '☕', color: 'peach', description: 'Güne taze kahveyle başla. Cam sürahi, yıkanabilir filtre ve sıcak tutma özelliği.' },
  { id: 'ayakkabi', title: 'Günlük spor ayakkabı', category: 'Moda', price: 899, originalPrice: 1499, icon: '👟', color: 'mint', description: 'Hafif taban ve nefes alan kumaşla gün boyunca rahat hareket et.' },
  { id: 'saat', title: 'Akıllı saat', category: 'Teknoloji', price: 2199, originalPrice: 3499, icon: '⌚', color: 'sand', description: 'Adımlarını, antrenmanlarını ve günlük hedeflerini tek ekrandan takip et.' },
  { id: 'lamba', title: 'Masa lambası', category: 'Ev & Yaşam', price: 449, originalPrice: 799, icon: '💡', color: 'yellow', description: 'Çalışma alanına sıcak bir dokunuş. Ayarlanabilir ışık ve sade bir tasarım.' },
  { id: 'yoga', title: 'Kaymaz yoga matı', category: 'Spor', price: 349, originalPrice: 599, icon: '🧘', color: 'pink', description: 'Evde ve stüdyoda antrenman için destekleyici, kolay taşınan kaymaz yüzey.' },
];

export const discount = (deal: Deal) => Math.round((1 - deal.price / deal.originalPrice) * 100);
export const currency = (value: number) => new Intl.NumberFormat('tr-TR', {
  style: 'currency', currency: 'TRY', maximumFractionDigits: 0,
}).format(value);
