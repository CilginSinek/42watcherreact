import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';

function Banned() {
  const navigate = useNavigate();
  const location = useLocation();
  const reason = (location.state as { reason?: string })?.reason;

  useEffect(() => {
    // Clear token and redirect after showing message
    const timer = setTimeout(() => {
      localStorage.removeItem('42_access_token');
      window.location.href = '/login';
    }, 30000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)' }} className="min-h-screen transition-colors duration-300 flex items-center justify-center">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="max-w-md mx-auto px-4">
        <div className="card text-center space-y-6">
          <div className="text-6xl">🚫</div>
          
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-red-500">Hesabınız Yasaklandı</h1>
            <p className="text-(--text-secondary) text-lg">
              42 Watcher platformuna erişim izniniz kaldırılmıştır.
            </p>
          </div>

          {reason && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-800">
                <strong>Sebep:</strong> {reason}
              </p>
            </div>
          )}

          <div className="space-y-4 text-sm text-(--text-secondary)">
            <p>
              Eğer bunun bir hata olduğunu düşünüyorsanız, lütfen bizimle iletişime geçin:
            </p>
            <a 
              href="mailto:iduman@student.42istanbul.com.tr" 
              className="inline-block px-6 py-3 bg-(--primary) text-white rounded-lg hover:opacity-90 transition"
            >
              İletişime Geç
            </a>
          </div>

          <p className="text-xs text-(--text-tertiary)">
            30 saniye içinde giriş sayfasına yönlendirileceksiniz...
          </p>
        </div>
      </div>
    </div>
  );
}

export default Banned;
