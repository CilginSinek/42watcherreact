import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import './Login.css';

const Login = () => {
  const { user, login, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <div>Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>42 Watcher</h1>
        <p>Please login with your 42 account to continue</p>
        <button className="login-button" onClick={login}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ marginRight: '8px' }}
          >
            <path d="M24 12.3l-5.7 5.7-5.7-5.7v-4.6l5.7-5.7 5.7 5.7v4.6zm-11.4 0l-5.7 5.7-5.7-5.7v-4.6l5.7-5.7 5.7 5.7v4.6z" />
          </svg>
          Login with 42
        </button>
      </div>
    </div>
  );
};

export default Login;
