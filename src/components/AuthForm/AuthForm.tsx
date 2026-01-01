import { useState } from 'react';

interface AuthFormProps {
  isBusy: boolean;
  error: string | null;
  onSignIn: (email: string, password: string) => void;
  onSignUp: (email: string, password: string) => void;
  defaultPassword?: string | null;
}

export function AuthForm({ isBusy, error, onSignIn, onSignUp, defaultPassword }: AuthFormProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(defaultPassword || '');

  const isSignIn = mode === 'signin';
  const title = isSignIn ? 'Sign in to DailyNote' : 'Create an account';
  const buttonText = isSignIn ? 'Sign in' : 'Create account';
  const toggleText = isSignIn
    ? "Don't have an account?"
    : 'Already have an account?';
  const toggleAction = isSignIn ? 'Sign up' : 'Sign in';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isSignIn) {
      onSignIn(email, password);
    } else {
      onSignUp(email, password);
    }
  };

  const handleToggle = () => {
    setMode(isSignIn ? 'signup' : 'signin');
  };

  return (
    <div className="vault-unlock">
      <div className="vault-unlock__card">
        <h2 className="vault-unlock__title">{title}</h2>
        <p className="vault-unlock__helper">
          Your notes are encrypted with your password.
        </p>

        <form className="vault-unlock__form" onSubmit={handleSubmit}>
          <label className="vault-unlock__label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="vault-unlock__input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isBusy}
            required
          />

          <label className="vault-unlock__label" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            className="vault-unlock__input"
            type="password"
            autoComplete={isSignIn ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isBusy}
            required
            minLength={6}
          />

          {error && <div className="vault-unlock__error">{error}</div>}

          <button
            className="button button--primary vault-unlock__button"
            type="submit"
            disabled={isBusy}
          >
            {isBusy ? 'Working...' : buttonText}
          </button>
        </form>

        <p className="vault-unlock__note">
          {toggleText}{' '}
          <button
            type="button"
            className="auth-form__toggle"
            onClick={handleToggle}
            disabled={isBusy}
          >
            {toggleAction}
          </button>
        </p>
      </div>
    </div>
  );
}
