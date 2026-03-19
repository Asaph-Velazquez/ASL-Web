import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsBuildingsFill } from 'react-icons/bs';

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE}/api/staff/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Invalid credentials');
        setLoading(false);
        return;
      }

      const data = await response.json();
      localStorage.setItem('staff_token', data.token);
      localStorage.setItem('staff_username', data.username || username);
      
      // Navegar al panel
      navigate('/');
    } catch (err) {
      setError('Login failed. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md">
        {/* Tarjeta */}
        <div className="rounded-lg shadow-lg p-8" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderWidth: 1 }}>
          {/* Encabezado */}
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md"
              style={{
                background: 'linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))',
              }}
            >
              <BsBuildingsFill className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>ASL Hotel Panel</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Staff Login</p>
          </div>

          {/* Mensaje de error */}
          {error && (
            <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', borderColor: 'var(--problem)', borderWidth: 1 }}>
              <p className="text-sm font-medium" style={{ color: 'var(--problem)' }}>{error}</p>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Campo de usuario */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border transition-all focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
                placeholder="Enter username"
                disabled={loading}
              />
            </div>

            {/* Campo de contrasena */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border transition-all focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
                placeholder="Enter password"
                disabled={loading}
              />
            </div>

            {/* Boton de envio */}
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-2.5 rounded-lg font-semibold text-white transition-all hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              style={{
                background: loading ? '#9ca3af' : 'linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))',
              }}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          {/* Pie */}
          <p className="text-xs text-center mt-6" style={{ color: 'var(--text-tertiary)' }}>
            Default credentials: admin / hotel2026
          </p>
          <p className="text-xs text-center mt-2" style={{ color: 'var(--text-tertiary)' }}>
            ¿Necesitas una cuenta?{' '}
            <button
              onClick={() => navigate('/register')}
              className="font-semibold hover:underline"
              style={{ color: 'var(--hotel-primary)' }}
            >
              Regístrate aquí
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
