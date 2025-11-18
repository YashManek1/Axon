import React from 'react';
import { Link } from 'react-router-dom';

const NotFound: React.FC = () => {
  return (
    <div style={{ 
      textAlign: 'center', 
      padding: '4rem 2rem',
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <h1 style={{ fontSize: '6rem', margin: 0, color: '#667eea' }}>404</h1>
      <h2 style={{ fontSize: '2rem', margin: '1rem 0', color: '#2d3748' }}>Page Not Found</h2>
      <p style={{ color: '#718096', marginBottom: '2rem' }}>
        The page you are looking for does not exist.
      </p>
      <Link 
        to="/" 
        style={{
          padding: '0.75rem 2rem',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '5px',
          fontWeight: 600
        }}
      >
        Go Home
      </Link>
    </div>
  );
};

export default NotFound;