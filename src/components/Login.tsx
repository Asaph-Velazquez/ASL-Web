import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
      
      // Navigate to dashboard
      navigate('/');
    } catch (err) {
      setError('Login failed. Please check your connection.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-lg shadow-lg p-8" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderWidth: 1 }}>
          {/* Header */}
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md"
              style={{
                background: 'linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))',
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="white"
                className="w-8 h-8"
                viewBox="0 0 16 16"
              >
                <path d="M14.763.075A.5.5 0 0 1 15 .5v15a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V14h-1v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V10a.5.5 0 0 1 .342-.474L6 7.64V4.5a.5.5 0 0 1 .276-.447l8-4a.5.5 0 0 1 .487.022M6 8.694 1 10.36V15h5zM7 15h2v-1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V15h2V1.309l-7 3.5z" />
                <path d="M2 11h1v1H2zm2 0h1v1H4zm-2 2h1v1H2zm2 0h1v1H4zm4-4h1v1H8zm2 0h1v1h-1zm-2 2h1v1H8zm2 0h1v1h-1zm2-2h1v1h-1zm0 2h1v1h-1zM8 7h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zM8 5h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zm0-2h1v1h-1z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>ASL Hotel Panel</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Staff Login</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', borderColor: 'var(--problem)', borderWidth: 1 }}>
              <p className="text-sm font-medium" style={{ color: 'var(--problem)' }}>{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username Input */}
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

            {/* Password Input */}
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

            {/* Submit Button */}
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

          {/* Footer */}
          <p className="text-xs text-center mt-6" style={{ color: 'var(--text-tertiary)' }}>
            Default credentials: admin / hotel2026
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
