import { createContext, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './styles.css';

import AdminPage from './pages/AdminPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';

/* ===== Auth Context ===== */
const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export { apiBase };

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated via cookie
    fetch(`${apiBase}/auth/validate`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.valid) setUser(data.user);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setUser(data.user);
    return data.user;
  }

  async function register(email, password) {
    const res = await fetch(`${apiBase}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    await fetch(`${apiBase}/auth/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
  }

  const isAdmin = user?.role === 'admin';

  if (loading) {
    return <div className="page" style={{ textAlign: 'center', paddingTop: '80px', color: 'var(--text-muted)' }}>Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

/* ===== Navbar ===== */
function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();

  function isActive(path) {
    return location.pathname === path ? 'active' : '';
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">StreamBox</Link>
      <div className="navbar-links">
        <Link to="/" className={isActive('/')}>Home</Link>
        {user && <Link to="/profile" className={isActive('/profile')}>Profile</Link>}
        {isAdmin && <Link to="/admin" className={isActive('/admin')}>Admin</Link>}
        {user ? (
          <div className="nav-user">
            <span className="nav-user-info">
              {user.email}
              <span className="role-badge">{user.role}</span>
            </span>
            <button className="btn-secondary btn-small" onClick={logout}>Logout</button>
          </div>
        ) : (
          <>
            <Link to="/login" className={isActive('/login')}>Login</Link>
            <Link to="/register" className={isActive('/register')}>
              <button className="btn-small">Register</button>
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

/* ===== App Shell ===== */
function AppShell() {
  return (
    <div className="app">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
