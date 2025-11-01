# ⚠️ ÖNEMLİ: 42 OAuth Redirect URI Değişikliği

## 🔧 Yapman Gereken

42 OAuth uygulama ayarlarına git ve Redirect URI'yi güncelle:

**Eski:** `http://localhost:5173/callback`
**Yeni:** `http://localhost:3000/callback`

### Nasıl Değiştirilir?

1. https://profile.intra.42.fr/oauth/applications adresine git
2. Uygulamana tıkla (42 Watcher)
3. "Edit" tıkla
4. Redirect URI kısmını güncelle: `http://localhost:3000/callback`
5. Save et

## 🚀 Çalıştırma

Artık projeyi şöyle çalıştır:

```bash
# Vercel dev server (Vite + Serverless functions)
vercel dev
```

Uygulama http://localhost:3000 adresinde açılacak.

## 📝 Neden Değişti?

- Vercel dev server 3000 portunda çalışıyor
- Serverless functions için Vercel CLI kullanmak zorundasın
- Normal `npm run dev` artık çalışmaz (serverless function olmaz)
