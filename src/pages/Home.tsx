import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import reactLogo from '../assets/react.svg';
import viteLogo from '/vite.svg';
import '../App.css';

function Home() {
  const [count, setCount] = useState(0);
  const { user, logout } = useAuth();

  return (
    <>
      <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {user && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <img 
                src={user.image.link} 
                alt={user.login} 
                style={{ width: '40px', height: '40px', borderRadius: '50%' }}
              />
              <span style={{ fontWeight: 'bold' }}>{user.login}</span>
            </div>
            <button onClick={logout} style={{ 
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: '#ef4444',
              color: 'white',
              cursor: 'pointer',
              fontWeight: '600'
            }}>
              Logout
            </button>
          </>
        )}
      </div>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
      <p style={{ marginTop: '2rem', color: '#00babc', fontWeight: 'bold' }}>
        🎉 Protected by 42 OAuth Authentication
      </p>
    </>
  );
}

export default Home;
