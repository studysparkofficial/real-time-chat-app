import React, { useEffect, useState } from 'react';
import { X, Mail, Lock, User, UserCheck, ShieldCheck } from 'lucide-react';
import { Button } from '../common/Button';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoogleSignIn: () => Promise<void>;
  onEmailSignIn: (email: string, pass: string) => Promise<void>;
  onEmailSignUp: (email: string, pass: string, name: string) => Promise<void>;
  onGuestSignIn: (guestName?: string) => Promise<void>;
  promptMessage?: string | null;
  isGuestSession?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp,
  onGuestSignIn,
  promptMessage = null,
  isGuestSession = false
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'guest'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && (isGuestSession || promptMessage)) {
      setMode('signin');
      setError(null);
    }
  }, [isOpen, isGuestSession, promptMessage]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        if (!email.trim() || !password) throw new Error('Please fill in both email and password.');
        const normalizedEmail = email.trim();
        if (!normalizedEmail.toLowerCase().endsWith('@jnu.ac.in')) {
          setError('Access is restricted to @jnu.ac.in email addresses.');
          return;
        }
        await onEmailSignIn(normalizedEmail, password);
      } else if (mode === 'signup') {
        if (!email.trim() || !password || !displayName) throw new Error('Please complete all fields.');
        if (password.length < 6) throw new Error('Password must be at least 6 characters.');
        const normalizedEmail = email.trim();
        if (!normalizedEmail.toLowerCase().endsWith('@jnu.ac.in')) {
          setError('Access is restricted to @jnu.ac.in email addresses.');
          return;
        }
        await onEmailSignUp(normalizedEmail, password, displayName);
      } else if (mode === 'guest') {
        await onGuestSignIn(guestName.trim() || undefined);
      }
      onClose();
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await onGoogleSignIn();
      onClose();
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Google sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay as-sheet" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px' }}
      >
        {/* Drag Indicator */}
        <div
          style={{
            width: '40px',
            height: '4px',
            borderRadius: '2px',
            background: 'var(--border-color)',
            margin: '0 auto 16px auto'
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '18px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src="/jnu-logo.png"
              alt="JNU"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid var(--accent-gold)'
              }}
            />
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {mode === 'signin'
                  ? 'Sign in to JNUverse'
                  : mode === 'signup'
                  ? 'Join JNUverse'
                  : 'Enter as Guest'}
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--accent-gold)', fontWeight: 600 }}>
                JNU CAMPUS HUB
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Tab Selector */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-tertiary)',
            padding: '4px',
            borderRadius: '12px',
            marginBottom: '20px'
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: '10px',
              border: 'none',
              background: mode === 'signin' ? 'var(--bg-secondary)' : 'transparent',
              color: mode === 'signin' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: mode === 'signin' ? 700 : 500,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: '10px',
              border: 'none',
              background: mode === 'signup' ? 'var(--bg-secondary)' : 'transparent',
              color: mode === 'signup' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: mode === 'signup' ? 700 : 500,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('guest');
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: '10px',
              border: 'none',
              background: mode === 'guest' ? 'var(--bg-secondary)' : 'transparent',
              color: mode === 'guest' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: mode === 'guest' ? 700 : 500,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Guest Pass
          </button>
        </div>

        {(promptMessage || isGuestSession) && mode !== 'guest' && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(212, 175, 55, 0.14)',
              border: '1px solid rgba(212, 175, 55, 0.35)',
              color: 'var(--accent-gold)',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '16px'
            }}
          >
            {promptMessage || 'Guest Pass is read-only. Sign in with your Google account to send messages, media, and interact.'}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '13.5px',
              marginBottom: '16px'
            }}
          >
            {error}
          </div>
        )}

        {/* 1-Click Google Sign In */}
        {mode !== 'guest' && (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card-hover)',
                color: 'var(--text-primary)',
                fontWeight: 700,
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                cursor: 'pointer',
                marginBottom: '16px',
                minHeight: '48px'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Continue with Google (jnu.ac.in / Gmail)
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                margin: '16px 0',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
              <span style={{ padding: '0 12px' }}>OR USE CAMPUS EMAIL</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mode === 'signup' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Full Name / Scholar Name
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '10px 14px'
                }}
              >
                <User size={18} color="var(--text-muted)" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Priyanshu Sharma"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '15px'
                  }}
                />
              </div>
            </div>
          )}

          {mode === 'guest' ? (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Guest Scholar Nickname
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '10px 14px'
                }}
              >
                <UserCheck size={18} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="e.g. Visitor Scholar"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '15px'
                  }}
                />
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Guest Pass grants read-only access to view chats and media. Sign in with Google to send messages or upload files.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Email Address
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '10px 14px'
                  }}
                >
                  <Mail size={18} color="var(--text-muted)" />
                  <input
                    type="email"
                    required
                    placeholder="name@jnu.ac.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '15px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Password
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '10px 14px'
                  }}
                >
                  <Lock size={18} color="var(--text-muted)" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '15px'
                    }}
                  />
                </div>
              </div>
            </>
          )}

          <Button
            type="submit"
            loading={loading}
            style={{ width: '100%', marginTop: '8px', minHeight: '48px', fontSize: '15px' }}
          >
            {mode === 'signin'
              ? 'Enter JNUverse'
              : mode === 'signup'
              ? 'Create Scholar Account'
              : 'Enter as Guest'}
          </Button>
        </form>
      </div>
    </div>
  );
};
