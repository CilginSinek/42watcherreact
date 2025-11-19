import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import mockData from '../mockData.json';

interface User {
  id: number;
  login: string;
  email: string;
  image: {
    link: string;
  };
  displayname: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
  token: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Localhost'ta mock user kullan
    if (isLocalhost) {
      setUser(mockData.mockUser as User);
      setToken('mock-token-for-localhost');
      setLoading(false);
      return;
    }

    // Production'da normal akış
    const storedToken = localStorage.getItem('42_access_token');
    if (storedToken) {
      setToken(storedToken);
      fetchUserData(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserData = async (token: string) => {
    // Localhost'ta API çağrısı yapma
    if (isLocalhost) {
      setUser(mockData.mockUser as User);
      setLoading(false);
      return;
    }

    // Production'da API çağrısı
    try {
      const response = await axios.get('/api/user/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setUser(response.data);
    } catch (error) {
      console.error('Error fetching user data:', error);
      localStorage.removeItem('42_access_token');
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    const clientId = import.meta.env.VITE_42_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_42_REDIRECT_URI;
    const authUrl = `https://api.intra.42.fr/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=public`;
    window.location.href = authUrl;
  };

  const logout = () => {
    localStorage.removeItem('42_access_token');
    setUser(null);
    setToken(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, token }}>
      {children}
    </AuthContext.Provider>
  );
};
