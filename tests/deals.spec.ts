import { expect, test } from '@playwright/test';

test('arama, kategori ve boş sonuçtan geri dönme', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(6);
  await page.getByRole('button', { name: 'Teknoloji', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('searchbox', { name: 'Fırsat ara' }).fill('KULAKLIK');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('searchbox').fill('olmayan ürün');
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByText('Aradığın fırsatı bulamadık')).toBeVisible();
  await page.getByRole('button', { name: 'Tüm fırsatları göster' }).click();
  await expect(page.getByRole('article')).toHaveCount(6);
});

test('favoriler yenileme sonrasında korunur ve kaldırılabilir', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Kablosuz kulaklık favorilere ekle' }).click();
  await page.reload();
  await page.getByRole('button', { name: /Favorilerim/ }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Kablosuz kulaklık' })).toBeVisible();
  await page.getByRole('button', { name: 'Kablosuz kulaklık favorilerden çıkar' }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByText('Burada henüz bir fırsat yok')).toBeVisible();
});

test('sıralama ve ürün detayı çalışır', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox').selectOption('price');
  await expect(page.getByRole('article').first().getByRole('heading')).toHaveText('Kaymaz yoga matı');
  await page.getByRole('combobox').selectOption('discount');
  await expect(page.getByRole('article').first().getByRole('heading')).toHaveText('Masa lambası');
  await page.getByRole('button', { name: 'Masa lambası detaylarını gör' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Satın alma bağlantısı bulunmuyor.');
  await page.getByRole('dialog').getByRole('button', { name: 'Favorilere ekle', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Masa lambası favorilerden çıkar' })).toHaveAttribute('aria-pressed', 'true');
});

test('mobil ekranda yatay taşma ve çalışma zamanı hatası yok', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Kablosuz kulaklık detaylarını gör' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(errors).toEqual([]);
});
