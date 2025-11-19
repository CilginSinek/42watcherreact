import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const Callback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const code = searchParams.get('code');
    
    if (!code) {
      setError('Authorization code not found');
      setIsProcessing(false);
      return;
    }

    const exchangeCodeForToken = async () => {
      try {
        const response = await axios.post('/api/auth/callback', { code });
        const { access_token } = response.data;
        localStorage.setItem('42_access_token', access_token);
        
        setTimeout(() => {
          navigate('/', { replace: true });
          window.location.reload();
        }, 500);
      } catch (error) {
        console.error('Error exchanging code for token:', error);
        setError('Authentication failed. Please try again.');
        setIsProcessing(false);
      }
    };

    exchangeCodeForToken();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="card border-2 border-red-500/30 bg-slate-900/50 backdrop-blur-sm text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-red-500/20 mb-4 mx-auto">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Authentication Error</h2>
            <p className="text-red-300 mb-6">{error}</p>
            <button
              onClick={() => navigate('/login')}
              className="btn-primary w-full py-2"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
        <p className="text-slate-300">Authenticating...</p>
        {isProcessing && <p className="text-slate-500 text-sm">Please wait while we verify your identity</p>}
      </div>
    </div>
  );
};

export default Callback;
