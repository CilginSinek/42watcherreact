# 42 Watcher React - Kurulum Rehberi

## 🚀 42 OAuth Kurulumu

### 1. 42 OAuth Uygulaması Oluşturma

1. [42 Profil Ayarları](https://profile.intra.42.fr/oauth/applications) adresine gidin
2. "New Application" butonuna tıklayın
3. Aşağıdaki bilgileri doldurun:
   - **Name**: 42 Watcher (veya istediğiniz bir isim)
   - **Redirect URI**: `http://localhost:3000/callback` (local development için)
   - **Scopes**: `public` seçeneğini işaretleyin

4. Uygulamayı kaydedin
5. **UID** (Client ID) ve **Secret** (Client Secret) değerlerini not alın

### 2. Environment Değişkenlerini Ayarlama

1. Proje kök dizininde `.env` dosyası oluşturun:
```bash
copy .env.example .env
```

2. `.env` dosyasını açın ve aşağıdaki değerleri doldurun:
```env
VITE_42_CLIENT_ID=sizin_client_id_buraya
VITE_42_CLIENT_SECRET=sizin_client_secret_buraya
VITE_42_REDIRECT_URI=http://localhost:3000/callback
```

### 3. Vercel CLI Kurulumu (Local Development için)

```bash
# Vercel CLI'yi global olarak yükleyin
npm install -g vercel

# Vercel CLI'ye login olun
vercel login
```

### 4. Uygulamayı Çalıştırma

⚠️ **Önemli**: Bu proje Vercel serverless functions kullanıyor, bu yüzden local development için Vercel CLI kullanmalısınız:

```bash
# Vercel dev server'ı başlatın (Vite + Serverless Functions)
vercel dev
```

Tarayıcınızda `http://localhost:3000` adresine gidin ve 42 hesabınızla giriş yapın!

## 🔒 Güvenlik Notları

- ✅ **Client Secret artık güvende!** Vercel serverless function'da kullanılıyor
- ⚠️ `.env` dosyasını **asla** git'e commit etmeyin!
- `.gitignore` dosyasında `.env` olduğundan emin olun
- Production'da Vercel dashboard'dan environment variables ekleyin

## 🚀 Production Deployment (Vercel)

1. Projeyi Vercel'e push edin:
```bash
vercel --prod
```

2. Vercel Dashboard'dan environment variables ekleyin:
   - `VITE_42_CLIENT_ID`
   - `VITE_42_CLIENT_SECRET`
   - `VITE_42_REDIRECT_URI` (production URL'iniz, örn: `https://yourdomain.com/callback`)

3. 42 OAuth uygulamanıza production redirect URI'yi ekleyin:
   - `https://yourdomain.com/callback`

## 📁 Proje Yapısı

```
src/
├── contexts/
│   └── AuthContext.tsx      # 42 OAuth authentication context
├── components/
│   └── ProtectedRoute.tsx   # Route protection component
├── pages/
│   ├── Home.tsx            # Ana sayfa (korumalı)
│   ├── Login.tsx           # Giriş sayfası
│   └── Callback.tsx        # OAuth callback handler
└── App.tsx                 # Route definitions

api/
└── auth/
    └── callback.ts         # Serverless function (token exchange)
```

## 🎯 Özellikler

- ✅ 42 OAuth ile güvenli giriş
- ✅ Protected routes (korumalı sayfalar)
- ✅ Kullanıcı profil bilgileri
- ✅ Otomatik token yönetimi
- ✅ Responsive tasarım
- ✅ **Güvenli backend (Vercel Serverless Functions)**
- ✅ Client Secret frontend'de gözükmüyor

## 🛠️ Kullanılan Teknolojiler

- React 19
- TypeScript
- React Router DOM
- Axios
- Vite
- Vercel Serverless Functions
- 42 API

## 📝 Not

Bu uygulama 42 okullarının API'sini kullanmaktadır. Sadece 42 öğrencileri giriş yapabilir.
