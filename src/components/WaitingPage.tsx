import React from 'react';

const WaitingPage: React.FC = () => {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f5f5f5',
      fontFamily: 'adobe-clean, Source Sans Pro, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
    }}>
      {/* Loading Spinner */}
      <div style={{
        width: '48px',
        height: '48px',
        border: '4px solid #e0e0e0',
        borderTop: '4px solid #1473e6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />

      {/* Message */}
      <p style={{
        marginTop: '24px',
        fontSize: '18px',
        color: '#2c2c2c',
        textAlign: 'center'
      }}>
        Processing your request, please wait...
      </p>

      {/* Inline keyframes animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default WaitingPage;
