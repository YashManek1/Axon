import React from 'react';
import './Footer.css';

const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <p>&copy; {new Date().getFullYear()} DevifyX Task Scheduler. All rights reserved.</p>
        <p>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          {' | '}
          <a href="/terms">Terms of Service</a>
          {' | '}
          <a href="/privacy">Privacy Policy</a>
        </p>
      </div>
    </footer>
  );
};

export default Footer;