import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  username: string | null;
}

export function useAuth() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    username: null,
  });

  // Initialize from localStorage
  useEffect(() => {
    const token = localStorage.getItem('staff_token');
    const username = localStorage.getItem('staff_username');

    if (token) {
      setAuth({
        isAuthenticated: true,
        token,
        username,
      });
    }
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('http://localhost:3001/api/staff/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      localStorage.setItem('staff_token', data.token);
      localStorage.setItem('staff_username', data.username || username);

      setAuth({
        isAuthenticated: true,
        token: data.token,
        username: data.username || username,
      });

      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_username');
    setAuth({
      isAuthenticated: false,
      token: null,
      username: null,
    });
    navigate('/login');
  };

  return {
    isAuthenticated: auth.isAuthenticated,
    token: auth.token,
    username: auth.username,
    login,
    logout,
  };
}
