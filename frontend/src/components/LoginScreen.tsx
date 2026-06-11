import { useState, FormEvent } from 'react';

const AUTH_KEY = 'agv:auth';
const PWD_HASH = btoa('mondelez'); // lightweight obfuscation

export function isAuthenticated(): boolean {
  return localStorage.getItem(AUTH_KEY) === PWD_HASH;
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
}

interface Props {
  onSuccess: () => void;
}

export function LoginScreen({ onSuccess }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (btoa(value) === PWD_HASH) {
      localStorage.setItem(AUTH_KEY, PWD_HASH);
      onSuccess();
    } else {
      setError(true);
      setShake(true);
      setValue('');
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '40px 48px', width: 360,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
        animation: shake ? 'shake 0.4s ease' : undefined,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            TechFleet Simulator
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>
            Wprowadź hasło dostępu
          </div>
        </div>

        {/* Form */}
        <form onSubmit={submit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            autoFocus
            type="password"
            placeholder="Hasło"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(false); }}
            style={{
              width: '100%', padding: '10px 14px',
              background: 'var(--elevated)', border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 8, color: 'var(--text)', fontSize: '0.95rem',
              outline: 'none', transition: 'border-color 0.15s',
            }}
          />
          {error && (
            <div style={{ fontSize: '0.78rem', color: 'var(--red)', textAlign: 'center' }}>
              Nieprawidłowe hasło
            </div>
          )}
          <button
            type="submit"
            style={{
              padding: '10px', borderRadius: 8,
              background: 'var(--accent)', border: 'none',
              color: '#000', fontWeight: 600, fontSize: '0.9rem',
              cursor: 'pointer', transition: 'opacity 0.15s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Zaloguj
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-5px); }
          80%       { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
