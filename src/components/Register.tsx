import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsPersonBadge } from 'react-icons/bs';

function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    role: 'staff',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validaciones
    if (!formData.username || !formData.password || !formData.fullName) {
      setError('Por favor completa todos los campos obligatorios');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE}/api/staff/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          fullName: formData.fullName,
          role: formData.role,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Error al registrar usuario');
        setLoading(false);
        return;
      }

      // Registro exitoso, redirigir a login
      alert('✅ Usuario registrado exitosamente');
      navigate('/login');
    } catch (err) {
      setError('Error al conectar con el servidor. Verifica tu conexión.');
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
              <BsPersonBadge className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Registro de Staff</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Hotel ASL Grand</p>
          </div>

          {/* Mensaje de error */}
          {error && (
            <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', borderColor: 'var(--problem)', borderWidth: 1 }}>
              <p className="text-sm font-medium" style={{ color: 'var(--problem)' }}>{error}</p>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleRegister} className="space-y-4">
            {/* Campo de nombre completo */}
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Nombre Completo *
              </label>
              <input
                id="fullName"
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border transition-all focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
                placeholder="Ej: Juan Pérez"
                disabled={loading}
              />
            </div>

            {/* Campo de usuario */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Usuario *
              </label>
              <input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border transition-all focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
                placeholder="Nombre de usuario"
                disabled={loading}
              />
            </div>

            {/* Campo de contrasena */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Contraseña *
              </label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border transition-all focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
                placeholder="Mínimo 6 caracteres"
                disabled={loading}
              />
            </div>

            {/* Campo de confirmar contrasena */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Confirmar Contraseña *
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border transition-all focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
                placeholder="Repite la contraseña"
                disabled={loading}
              />
            </div>

            {/* Boton de envio */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-semibold text-white transition-all hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              style={{
                background: loading ? '#9ca3af' : 'linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))',
              }}
            >
              {loading ? 'Registrando...' : 'Registrar Usuario'}
            </button>
          </form>

          {/* Pie */}
          <div className="text-center mt-6 space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              ¿Ya tienes una cuenta?{' '}
              <button
                onClick={() => navigate('/login')}
                className="font-semibold hover:underline"
                style={{ color: 'var(--hotel-primary)' }}
              >
                Inicia sesión
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;
