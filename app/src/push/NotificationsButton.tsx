import { useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import { useToast } from '../ui/Toast';
import { enablePush } from './push';

/** "Turn on notifications". Gone once the user has answered; after a failure it stays for another try. */
export function NotificationsButton({ uid }: { uid: string }) {
  const { t } = useT();
  const toast = useToast();
  const [state, setState] = useState<'idle' | 'busy' | 'answered'>('idle');
  if (state === 'answered') return null;

  function turnOn() {
    setState('busy');
    // Called straight from the tap: enablePush asks for permission before awaiting anything (iOS needs that).
    void enablePush(uid).then((result) => {
      if (result === 'granted') toast(t('push.enabled'));
      if (result === 'unsupported') toast(t('error.generic'));
      setState(result === 'unsupported' ? 'idle' : 'answered');
    });
  }

  return (
    <div className="banner-action">
      <button type="button" className="btn btn-primary" disabled={state === 'busy'} onClick={turnOn}>{t('push.enable')}</button>
    </div>
  );
}
