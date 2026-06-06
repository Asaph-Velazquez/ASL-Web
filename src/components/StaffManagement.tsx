import { useState, useEffect } from 'react';
import { BsPersonBadge, BsPlusLg, BsTrash, BsPencilSquare, BsXLg } from 'react-icons/bs';

// Iconos Bootstrap
const AdminIcon = ({ className = "w-6 h-6" }) => <BsPersonBadge className={className} />;
const TrashIcon = ({ className = "w-4 h-4" }) => <BsTrash className={className} />;
const EditIcon = ({ className = "w-4 h-4" }) => <BsPencilSquare className={className} />;
const PlusIcon = ({ className = "w-4 h-4" }) => <BsPlusLg className={className} />;
const XIcon = ({ className = "w-4 h-4" }) => <BsXLg className={className} />;

interface StaffUser {
  _id: string;
  username: string;
  fullName?: string;
  role: 'staff' | 'admin';
  createdAt: string;
}

interface RegisterForm {
  username: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  role: 'staff' | 'admin';
}

interface EditForm {
  username: string;
  fullName: string;
  role: 'staff' | 'admin';
}

interface NotificationState {
  open: boolean;
  message: string;
  type: 'success' | 'error' | 'warning';
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const INITIAL_REGISTER_FORM: RegisterForm = {
  username: '',
  password: '',
  confirmPassword: '',
  fullName: '',
  role: 'staff',
};

const ROLE_META: Record<StaffUser['role'], { label: string; badgeClass: string }> = {
  admin: { label: 'Administrator', badgeClass: 'bg-red-500' },
  staff: { label: 'Staff', badgeClass: 'bg-green-500' },
};

const getApiErrorMessage = async (response: Response, fallback: string) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const data = await response.json();
      return data?.error || fallback;
    } catch {
      return fallback;
    }
  }

  const text = await response.text();
  if (text?.trim().startsWith('<!DOCTYPE') || text?.trim().startsWith('<html')) {
    return `${fallback} (HTML response from server, status ${response.status})`;
  }

  return text || fallback;
};

function StaffManagement() {
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ username: '', fullName: '', role: 'staff' });
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterForm>(INITIAL_REGISTER_FORM);
  const [notification, setNotification] = useState<NotificationState>({
    open: false,
    message: '',
    type: 'success',
  });

  const showNotification = (message: string, type: NotificationState['type']) => {
    setNotification({ open: true, message, type });
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, open: false }));
    }, 3200);
  };

  const getAuthHeaders = (withJson = false) => {
    const token = localStorage.getItem('staff_token');
    return {
      ...(withJson ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
  };

  const resetRegisterForm = () => setRegisterForm(INITIAL_REGISTER_FORM);

  const closeRegisterModal = () => {
    setShowRegisterModal(false);
    resetRegisterForm();
  };

  const updateRegisterField = <K extends keyof RegisterForm>(field: K, value: RegisterForm[K]) => {
    setRegisterForm((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    fetchStaffList();
  }, []);

  const fetchStaffList = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/staff/list`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Unable to load the staff list');
      }

      const data = await response.json();
      setStaffList(data.users || []);
      setLoading(false);
    } catch (err) {
      setError('Error loading the staff list');
      setLoading(false);
    }
  };

  const startEditingUser = (user: StaffUser) => {
    setEditingUser(user._id);
    setEditForm({
      username: user.username,
      fullName: user.fullName || '',
      role: user.role,
    });
  };

  const cancelEditingUser = () => {
    setEditingUser(null);
    setEditForm({ username: '', fullName: '', role: 'staff' });
  };

  const handleUpdateUser = async (userId: string) => {
    if (!editForm.username.trim() || !editForm.fullName.trim()) {
      showNotification('Username and full name are required', 'warning');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/staff/update/${userId}`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          username: editForm.username.trim(),
          fullName: editForm.fullName.trim(),
          role: editForm.role,
        }),
      });

      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Unable to update the user');
        throw new Error(message);
      }

      const data = await response.json();
      const updated = data.user as StaffUser;

      // Actualizar la lista localmente
      setStaffList(prev =>
        prev.map(user =>
          user._id === userId ? { ...user, ...updated } : user
        )
      );
      cancelEditingUser();
      showNotification('User updated successfully', 'success');
    } catch (err: any) {
      showNotification(err.message || 'Error updating the user', 'error');
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/staff/delete/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Unable to delete the user');
      }

      // Actualizar la lista localmente
      setStaffList(prev => prev.filter(user => user._id !== userId));
      showNotification('User deleted successfully', 'success');
    } catch (err) {
      showNotification('Error deleting the user', 'error');
    }
  };

  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones
    if (!registerForm.username || !registerForm.password) {
      showNotification('Username and password are required', 'warning');
      return;
    }

    if (registerForm.password !== registerForm.confirmPassword) {
      showNotification('Passwords do not match', 'warning');
      return;
    }

    if (registerForm.password.length < 6) {
      showNotification('Password must be at least 6 characters long', 'warning');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/staff/register`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          username: registerForm.username,
          password: registerForm.password,
          fullName: registerForm.fullName,
          role: registerForm.role,
        }),
      });

      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Error registering user');
        throw new Error(message);
      }

      showNotification('User registered successfully', 'success');
      closeRegisterModal();
      
      // Recargar la lista
      fetchStaffList();
    } catch (err: any) {
      showNotification(err.message || 'Error registering user', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-auto-primary flex items-center justify-center">
        <div className="text-auto-primary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-auto-primary">
      {notification.open && (
        <div className="fixed top-4 right-4 z-[60] max-w-sm w-[calc(100%-2rem)] sm:w-auto">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg border backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] ${
              notification.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-800'
                : notification.type === 'error'
                  ? 'bg-red-50/95 border-red-200 text-red-800'
                  : 'bg-amber-50/95 border-amber-200 text-amber-800'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-sm leading-5 font-medium">{notification.message}</span>
              <button
                onClick={() => setNotification((prev) => ({ ...prev, open: false }))}
                className="ml-auto text-current/70 hover:text-current transition-colors"
                title="Close notification"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Encabezado */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-auto-secondary/90 border-b border-auto shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md transition-all hover:scale-105"
                style={{
                  background: "linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))",
                }}
              >
                <AdminIcon className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-auto-primary tracking-tight">
                  Staff Management
                </h1>
                <p className="text-xs text-auto-tertiary">
                  Manage users and roles
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRegisterModal(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:scale-105 flex items-center gap-2"
                style={{ backgroundColor: "var(--hotel-primary)" }}
                title="Register new user"
              >
                <PlusIcon className="w-4 h-4" />
                Register User
              </button>
              <div className="text-sm text-auto-secondary">
                {staffList.length} registered users
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-auto-secondary rounded-xl shadow-sm border border-auto p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-auto">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-auto-secondary">Username</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-auto-secondary">Full Name</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-auto-secondary">Role</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-auto-secondary">Registration Date</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-auto-secondary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((user) => (
                  <tr key={user._id} className="border-b border-auto hover:bg-auto-tertiary/30 transition-colors">
                    <td className="py-3 px-4 text-sm text-auto-primary font-medium">
                      {editingUser === user._id ? (
                        <input
                          type="text"
                          value={editForm.username}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, username: e.target.value }))}
                          className="w-full min-w-[140px] px-3 py-1 rounded-lg border border-auto bg-auto-tertiary text-xs font-medium text-auto-primary focus:outline-none focus:ring-2"
                          style={{
                            "--tw-ring-color": "var(--hotel-primary)",
                          } as React.CSSProperties}
                        />
                      ) : (
                        user.username
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-auto-secondary">
                      {editingUser === user._id ? (
                        <input
                          type="text"
                          value={editForm.fullName}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                          className="w-full min-w-[180px] px-3 py-1 rounded-lg border border-auto bg-auto-tertiary text-xs text-auto-primary focus:outline-none focus:ring-2"
                          style={{
                            "--tw-ring-color": "var(--hotel-primary)",
                          } as React.CSSProperties}
                        />
                      ) : (
                        user.fullName || '-'
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {editingUser === user._id ? (
                        <select
                          value={editForm.role}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value as 'staff' | 'admin' }))}
                          className="px-3 py-1 rounded-lg border border-auto bg-auto-tertiary text-xs font-medium text-auto-primary focus:outline-none focus:ring-2"
                          style={{
                            "--tw-ring-color": "var(--hotel-primary)",
                          } as React.CSSProperties}
                        >
                          <option value="staff">Staff</option>
                          <option value="admin">Administrator</option>
                        </select>
                      ) : (
                        <span className={`px-3 py-1 rounded-md text-xs font-semibold text-white ${ROLE_META[user.role].badgeClass}`}>
                          {ROLE_META[user.role].label}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-auto-tertiary">
                      {new Date(user.createdAt).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        {editingUser === user._id ? (
                          <>
                            <button
                              onClick={() => handleUpdateUser(user._id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:scale-105"
                              style={{ backgroundColor: "var(--success)" }}
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEditingUser}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-auto text-auto-secondary transition-all hover:bg-auto-tertiary"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEditingUser(user)}
                              className="p-2 rounded-lg transition-all hover:bg-auto-tertiary"
                              style={{ color: "var(--hotel-primary)" }}
                              title="Edit user"
                            >
                              <EditIcon />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user._id, user.username)}
                              className="p-2 rounded-lg transition-all hover:bg-red-50"
                              style={{ color: "var(--problem)" }}
                              title="Delete user"
                            >
                              <TrashIcon />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {staffList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-auto-tertiary text-sm">
                      No registered users
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Caja informativa */}
        <div className="mt-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-400">
            <strong>Note:</strong> Only administrators can assign the "Administrator" role to other users.
            Users with the "Staff" role have basic system permissions.
          </p>
        </div>
      </div>

      {/* Modal de Registro */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <div className="w-full max-w-md rounded-xl shadow-2xl p-6 bg-auto-secondary border border-auto">
            {/* Header del Modal */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-auto-primary">Register New User</h2>
              <button
                onClick={closeRegisterModal}
                className="p-2 rounded-lg hover:bg-auto-tertiary transition-all"
                title="Close"
              >
                <XIcon className="w-4 h-4 text-auto-secondary" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleRegisterUser} className="space-y-4">
              {/* Nombre Completo */}
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium mb-2 text-auto-secondary">
                  Full Name *
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={registerForm.fullName}
                  onChange={(e) => updateRegisterField('fullName', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-auto bg-auto-tertiary text-auto-primary focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "var(--hotel-primary)" } as React.CSSProperties}
                  placeholder="Example: John Smith"
                  required
                />
              </div>

              {/* Usuario */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium mb-2 text-auto-secondary">
                  Username *
                </label>
                <input
                  id="username"
                  type="text"
                  value={registerForm.username}
                  onChange={(e) => updateRegisterField('username', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-auto bg-auto-tertiary text-auto-primary focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "var(--hotel-primary)" } as React.CSSProperties}
                  placeholder="Username"
                  required
                />
              </div>

              {/* Contraseña */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-2 text-auto-secondary">
                  Password *
                </label>
                <input
                  id="password"
                  type="password"
                  value={registerForm.password}
                  onChange={(e) => updateRegisterField('password', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-auto bg-auto-tertiary text-auto-primary focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "var(--hotel-primary)" } as React.CSSProperties}
                  placeholder="At least 6 characters"
                  required
                />
              </div>

              {/* Confirmar Contraseña */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2 text-auto-secondary">
                  Confirm Password *
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={registerForm.confirmPassword}
                  onChange={(e) => updateRegisterField('confirmPassword', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-auto bg-auto-tertiary text-auto-primary focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "var(--hotel-primary)" } as React.CSSProperties}
                  placeholder="Repeat password"
                  required
                />
              </div>

              {/* Rol */}
              <div>
                <label htmlFor="role" className="block text-sm font-medium mb-2 text-auto-secondary">
                  Role *
                </label>
                <select
                  id="role"
                  value={registerForm.role}
                  onChange={(e) => updateRegisterField('role', e.target.value as 'staff' | 'admin')}
                  className="w-full px-4 py-2 rounded-lg border border-auto bg-auto-tertiary text-auto-primary focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "var(--hotel-primary)" } as React.CSSProperties}
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeRegisterModal}
                  className="flex-1 py-2.5 rounded-lg font-medium border border-auto text-auto-secondary transition-all hover:bg-auto-tertiary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg font-medium text-white transition-all hover:shadow-lg active:scale-95"
                  style={{ backgroundColor: "var(--hotel-primary)" }}
                >
                  Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffManagement;
