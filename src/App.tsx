import { Route, Routes, Navigate } from 'react-router';
import { useState, useEffect } from 'react';

import Home from './components/Home';
import StayManagement from './components/StayManagement';
import Login from './components/Login';
import Register from './components/Register';
import StaffManagement from './components/StaffManagement';
import Statistics from './components/Statistics';
import LogsManagement from './components/LogsManagement';
import InterpreterReports from './components/InterpreterReports';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('staff_token'));

  useEffect(() => {
    const syncSession = () => setIsAuthenticated(!!localStorage.getItem('staff_token'));
    window.addEventListener('storage', syncSession);
    return () => window.removeEventListener('storage', syncSession);
  }, []);

  return (
    <div>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login onAuthenticated={() => setIsAuthenticated(true)} />} />
        <Route path="/register" element={<Register />} />
        {isAuthenticated ? (
          <>
            <Route path="/" element={<Home onLogout={() => setIsAuthenticated(false)} />} />
            <Route path="/stays" element={<StayManagement />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/logs" element={<LogsManagement />} />
            <Route path="/interpreter-reports" element={<InterpreterReports />} />
            <Route path="/admin" element={<StaffManagement />} />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/login" />} />
        )}
      </Routes>
    </div>
  );
}

export default App;
