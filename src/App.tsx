import { Route, Routes, Navigate } from 'react-router';
import { useState, useEffect } from 'react';

import Home from './components/Home';
import StayManagement from './components/StayManagement';
import Login from './components/Login';
import Register from './components/Register';
import StaffManagement from './components/StaffManagement';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Verificar autenticacion al montar
  useEffect(() => {
    const token = localStorage.getItem('staff_token');
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }
  return (
    <div>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {isAuthenticated ? (
          <>
            <Route path="/" element={<Home />} />
            <Route path="/stays" element={<StayManagement />} />
            <Route path="/admin" element={<StaffManagement />} />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/login" />} />
        )}
      </Routes>
    </div>
  )
}

export default App
