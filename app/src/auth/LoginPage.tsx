import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { MsgKey } from '@shared/i18n';
import { auth } from '../firebase';
import { useT } from '../i18n/I18nProvider';

const BAD_CREDENTIALS = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'];

export function LoginPage() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<MsgKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // The session provider notices the sign-in and the router leaves this page.
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(BAD_CREDENTIALS.includes(code) ? 'login.error' : 'error.generic');
      setBusy(false);
    }
  }

  return (
    <main className="content auth-page">
      <h1>{t('login.title')}</h1>
      <form onSubmit={submit}>
        <label className="field">
          <span>{t('login.email')}</span>
          <input type="email" name="email" autoComplete="username" inputMode="email" autoCapitalize="none" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('login.password')}</span>
          <input type="password" name="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{t(error)}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{t('login.submit')}</button>
      </form>
      <p><Link to="/reset" className="link">{t('login.reset')}</Link></p>
    </main>
  );
}
