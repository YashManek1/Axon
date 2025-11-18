import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../utils/helpers';
import './Home.css';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const authenticated = isAuthenticated();

  const handleGetStarted = () => {
    if (authenticated) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="home-container">
      <section className="hero-section">
        <h1>DevifyX Task Scheduler</h1>
        <p>Automate your tasks with powerful cron-based scheduling</p>
        <div className="cta-buttons">
          <button onClick={handleGetStarted} className="btn-primary">
            {authenticated ? 'Go to Dashboard' : 'Get Started'}
          </button>
          {!authenticated && (
            <Link to="/register" className="btn-secondary">
              Sign Up Free
            </Link>
          )}
        </div>
      </section>

      <section className="features-section">
        <h2>Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🚀</div>
            <h3>HTTP Jobs</h3>
            <p>
              Schedule HTTP requests to any endpoint with custom headers, methods,
              and payloads. Perfect for API integrations and webhooks.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">⚙️</div>
            <h3>Shell Commands</h3>
            <p>
              Execute shell commands and scripts on a schedule. Ideal for
              backups, deployments, and system maintenance tasks.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">⏰</div>
            <h3>Cron Scheduling</h3>
            <p>
              Use familiar cron syntax to schedule jobs. Run tasks every minute,
              hour, day, or create complex custom schedules.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔗</div>
            <h3>Job Dependencies</h3>
            <p>
              Create workflows by linking jobs together. Ensure jobs run in the
              correct order with dependency management.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Real-time Monitoring</h3>
            <p>
              Track job execution, view history, and monitor success rates.
              Stay informed about your automated tasks.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3>Secure & Reliable</h3>
            <p>
              Enterprise-grade security with JWT authentication. Your scheduled
              jobs are safe and execute reliably.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;