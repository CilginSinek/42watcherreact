import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const Callback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    
    if (!code) {
      setError('Authorization code not found');
      return;
    }

    const exchangeCodeForToken = async () => {
      try {
        // Call our serverless function instead of directly calling 42 API
        const response = await axios.post('/api/auth/callback', {
          code: code,
        });

        const { access_token } = response.data;
        localStorage.setItem('42_access_token', access_token);
        
        // Redirect to home page
        navigate('/', { replace: true });
        // Force reload to update auth context
        window.location.reload();
      } catch (error) {
        console.error('Error exchanging code for token:', error);
        setError('Authentication failed. Please try again.');
      }
    };

    exchangeCodeForToken();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        gap: '1rem'
      }}>
        <div style={{ color: '#ef4444', fontSize: '1.2rem' }}>{error}</div>
        <button 
          onClick={() => navigate('/login')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            border: 'none',
            background: '#00babc',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh' 
    }}>
      <div>Authenticating...</div>
    </div>
  );
};

export default Callback;
