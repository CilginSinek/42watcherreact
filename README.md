# 42 Watcher

<div align="center">
  <h3>🎓 42 School Student Monitoring System</h3>
  <p>A modern web application for tracking and monitoring 42 School students with advanced filtering and cheat detection capabilities.</p>
  
  [![Live Demo](https://img.shields.io/badge/demo-live-success)](https://your-vercel-url.vercel.app)
  [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)](https://www.typescriptlang.org)
</div>

---

## 📖 English

### 🌟 Features

- **🔐 42 OAuth Authentication**: Secure login with 42 Intra API
- **👥 Student Directory**: Browse and search all students from Istanbul and Kocaeli campuses
- **🔍 Advanced Filtering**: 
  - Campus-specific filtering (Istanbul/Kocaeli)
  - Status filters (Active, Blackhole, Piscine, Transcender, Alumni, Sinker, Freeze)
  - Cheaters detection and filtering
- **📊 Sorting Options**: Sort by login, correction points, wallet, created date, or cheat count
- **🚨 Cheat Detection**: Real-time cheat tracking with detailed project information
- **🎨 Modern UI**: Beautiful gradient design with smooth animations
- **📱 Responsive**: Works perfectly on desktop, tablet, and mobile devices
- **⚡ Fast**: Built with Vite and optimized for performance

### 🛠️ Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite 7.1.7 (Build tool)
- React Router DOM 7.9.5 (Routing)
- Axios (HTTP client)
- CSS3 (Styling)

**Backend:**
- Vercel Serverless Functions (Node.js) - Only for OAuth
- External API for data
- 42 API Integration

**Authentication:**
- 42 OAuth 2.0
- Secure token handling with serverless functions

**Note:** This is a frontend-only application. You need to provide your own backend API.

### 📦 Installation

1. **Clone the repository**
```bash
git clone https://github.com/cilginsinek/42watcherreact.git
cd 42watcherreact
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment Variables**

Create a `.env` file in the root directory:

```env
# Frontend (Vite)
VITE_FORTYTWO_CLIENT_ID=your_42_client_id
VITE_REDIRECT_URI=http://localhost:5173/callback

# Backend (Vercel Functions)
FORTYTWO_CLIENT_ID=your_42_client_id
FORTYTWO_CLIENT_SECRET=your_42_client_secret
FORTYTWO_REDIRECT_URI=http://localhost:5173/callback

# External Backend API URL
VITE_API_URL=https://your-backend-api.com
```

4. **Run development server**
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 🚀 Deployment

This project is configured for Vercel deployment:

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### 📁 Project Structure

```
42watcherreact/
├── api/                      # Serverless functions
│   ├── auth/
│   │   └── callback.ts      # OAuth token exchange
│   └── user/
│       └── me.ts            # User profile endpoint
├── src/
│   ├── components/          # React components
│   │   └── ProtectedRoute.tsx
│   ├── contexts/            # React contexts
│   │   └── AuthContext.tsx
│   ├── pages/               # Page components
│   │   ├── Home.tsx         # Main student directory
│   │   ├── Login.tsx        # Login page
│   │   └── Callback.tsx     # OAuth callback handler
│   └── main.tsx             # App entry point
└── vercel.json              # Vercel configuration
```

### 🔑 Key Features Explained

#### Campus Filtering
Filter students by their campus:
- **Istanbul Campus (ID: 49)**
- **Kocaeli Campus (ID: 50)**

#### Status Filters
- **Active**: Currently active students
- **Blackhole**: Students approaching blackhole deadline
- **Piscine**: Students in piscine (bootcamp)
- **Transcender**: Transfer students
- **Alumni**: Graduated students
- **Sinker**: Inactive students without AGU
- **Freeze**: Inactive students with AGU
- **Cheaters**: Students with cheat records

#### Sorting
- Login (alphabetical)
- Correction Points (evaluation points)
- Wallet (₳ currency)
- Created Date (account creation)
- Cheat Count (number of cheat records)

### 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### 📄 License

This project is licensed under the MIT License.

### 👨‍💻 Author

Made with ❤️ by [sinek.dev](https://sinek.dev)

- GitHub: [@cilginsinek](https://github.com/cilginsinek)
- Repository: [42watcherreact](https://github.com/cilginsinek/42watcherreact)

---

## 🇹🇷 Türkçe

### 🌟 Özellikler

- **🔐 42 OAuth Kimlik Doğrulama**: 42 Intra API ile güvenli giriş
- **👥 Öğrenci Dizini**: İstanbul ve Kocaeli kampüslerindeki tüm öğrencileri görüntüleyin ve arayın
- **🔍 Gelişmiş Filtreleme**: 
  - Kampüse özel filtreleme (İstanbul/Kocaeli)
  - Durum filtreleri (Aktif, Blackhole, Piscine, Transcender, Mezun, Sinker, Freeze)
  - Kopya tespiti ve filtreleme
- **📊 Sıralama Seçenekleri**: Login, düzeltme puanı, cüzdan, oluşturulma tarihi veya kopya sayısına göre sıralama
- **🚨 Kopya Tespiti**: Detaylı proje bilgileri ile gerçek zamanlı kopya takibi
- **🎨 Modern Arayüz**: Akıcı animasyonlarla güzel gradient tasarım
- **📱 Responsive**: Masaüstü, tablet ve mobil cihazlarda mükemmel çalışır
- **⚡ Hızlı**: Vite ile geliştirilmiş ve performans için optimize edilmiş

### 🛠️ Teknoloji Yığını

**Frontend:**
- React 19 + TypeScript
- Vite 7.1.7 (Build aracı)
- React Router DOM 7.9.5 (Routing)
- Axios (HTTP client)
- CSS3 (Stil)

**Backend:**
- Vercel Serverless Functions (Node.js) - Sadece OAuth için
- Veri için harici API
- 42 API Entegrasyonu

**Kimlik Doğrulama:**
- 42 OAuth 2.0
- Serverless fonksiyonlar ile güvenli token yönetimi

**Not:** Bu sadece frontend bir uygulamadır. Kendi backend API'nizi sağlamanız gerekir.

### 📦 Kurulum

1. **Repoyu klonlayın**
```bash
git clone https://github.com/cilginsinek/42watcherreact.git
cd 42watcherreact
```

2. **Bağımlılıkları yükleyin**
```bash
npm install
```

3. **Ortam Değişkenleri**

Kök dizinde `.env` dosyası oluşturun:

```env
# Frontend (Vite)
VITE_FORTYTWO_CLIENT_ID=42_client_id
VITE_REDIRECT_URI=http://localhost:5173/callback

# Backend (Vercel Functions)
FORTYTWO_CLIENT_ID=42_client_id
FORTYTWO_CLIENT_SECRET=42_client_secret
FORTYTWO_REDIRECT_URI=http://localhost:5173/callback

# Harici Backend API URL
VITE_API_URL=https://sizin-backend-api.com
```

4. **Geliştirme sunucusunu başlatın**
```bash
npm run dev
```

Uygulama `http://localhost:5173` adresinde çalışacaktır.

### 🚀 Deploy

Bu proje Vercel deploy'u için yapılandırılmıştır:

1. GitHub reponuzu Vercel'e bağlayın
2. Vercel dashboard'unda ortam değişkenlerini ekleyin
3. Main branch'e push yaptığınızda otomatik deploy olur

### 📁 Proje Yapısı

```
42watcherreact/
├── api/                      # Serverless fonksiyonlar
│   ├── auth/
│   │   └── callback.ts      # OAuth token değişimi
│   └── user/
│       └── me.ts            # Kullanıcı profil endpoint'i
├── src/
│   ├── components/          # React bileşenleri
│   │   └── ProtectedRoute.tsx
│   ├── contexts/            # React context'leri
│   │   └── AuthContext.tsx
│   ├── pages/               # Sayfa bileşenleri
│   │   ├── Home.tsx         # Ana öğrenci dizini
│   │   ├── Login.tsx        # Giriş sayfası
│   │   └── Callback.tsx     # OAuth callback işleyicisi
│   └── main.tsx             # Uygulama giriş noktası
└── vercel.json              # Vercel yapılandırması
```

### 🔑 Önemli Özellikler

#### Kampüs Filtreleme
Öğrencileri kampüslerine göre filtreleyin:
- **İstanbul Kampüsü (ID: 49)**
- **Kocaeli Kampüsü (ID: 50)**

#### Durum Filtreleri
- **Active**: Şu anda aktif öğrenciler
- **Blackhole**: Blackhole deadline'ına yaklaşan öğrenciler
- **Piscine**: Piscine'de (bootcamp) olan öğrenciler
- **Transcender**: Transfer öğrenciler
- **Alumni**: Mezun olmuş öğrenciler
- **Sinker**: AGU'su olmayan inaktif öğrenciler
- **Freeze**: AGU'su olan inaktif öğrenciler
- **Cheaters**: Kopya kaydı olan öğrenciler

#### Sıralama
- Login (alfabetik)
- Correction Points (değerlendirme puanları)
- Wallet (₳ para birimi)
- Created Date (hesap oluşturma tarihi)
- Cheat Count (kopya kayıt sayısı)

### 🤝 Katkıda Bulunma

Katkılar memnuniyetle karşılanır! Pull Request göndermekten çekinmeyin.

### 📄 Lisans

Bu proje MIT Lisansı altında lisanslanmıştır.

### 👨‍💻 Geliştirici

❤️ ile [sinek.dev](https://sinek.dev) tarafından yapılmıştır

- GitHub: [@cilginsinek](https://github.com/cilginsinek)
- Repository: [42watcherreact](https://github.com/cilginsinek/42watcherreact)

---

<div align="center">
  <p>⭐ Beğendiyseniz yıldız vermeyi unutmayın!</p>
  <p>⭐ If you like it, don't forget to give it a star!</p>
</div>
