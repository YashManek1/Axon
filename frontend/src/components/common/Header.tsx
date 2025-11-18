import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getUser, isAuthenticated, logout } from '../../utils/helpers';
import './Header.css';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const user = getUser();
  const authenticated = isAuthenticated();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <Link to="/">DevifyX Task Scheduler</Link>
        </div>
        <nav>
          <ul>
            <li>
              <Link to="/">Home</Link>
            </li>
            {authenticated && (
              <>
                <li>
                  <Link to="/dashboard">Dashboard</Link>
                </li>
                {user?.role === 'admin' && (
                  <li>
                    <Link to="/admin">Admin</Link>
                  </li>
                )}
              </>
            )}
          </ul>
        </nav>
        <div className="auth-buttons">
          {authenticated ? (
            <>
              <span className="user-info">{user?.email}</span>
              <button onClick={handleLogout} className="btn-logout">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-logout">
                Login
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;