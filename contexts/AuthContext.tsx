'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('42_access_token');
    if (storedToken) {
      setToken(storedToken);
      fetchUserData(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserData = async (accessToken: string) => {
    try {
      const response = await fetch('/api/user/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();
      setUser(data);
    } catch (error) {
      console.error('Error fetching user data:', error);
      localStorage.removeItem('42_access_token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    const clientId = process.env.NEXT_PUBLIC_42_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_42_REDIRECT_URI;
    const authUrl = `https://api.intra.42.fr/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri || ''
    )}&response_type=code&scope=public`;
    window.location.href = authUrl;
  };

  const logout = () => {
    localStorage.removeItem('42_access_token');
    setUser(null);
    setToken(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, token, setUser, setToken }}>
      {children}
    </AuthContext.Provider>
  );
};
