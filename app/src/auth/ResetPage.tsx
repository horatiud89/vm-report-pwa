import { sendPasswordResetEmail } from 'firebase/auth';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebase';
import { useT } from '../i18n/I18nProvider';

export function ResetPage() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus('busy');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setStatus('sent');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <main className="content auth-page">
      <h1>{t('login.reset')}</h1>
      <form onSubmit={submit}>
        <label className="field">
          <span>{t('login.email')}</span>
          <input type="email" name="email" autoComplete="username" inputMode="email" autoCapitalize="none" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {status === 'failed' && <p className="form-error" role="alert">{t('error.generic')}</p>}
        {status === 'sent' && <p className="form-note" role="status">{t('reset.sent')}</p>}
        <button type="submit" className="btn btn-primary" disabled={status === 'busy'}>{t('reset.submit')}</button>
      </form>
      <p><Link to="/login" className="link">{t('reset.back')}</Link></p>
    </main>
  );
}
