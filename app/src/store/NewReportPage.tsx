import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../auth/AuthProvider';
import { createDraft } from '../api';
import { useStoreReports } from '../data/hooks';
import { useT } from '../i18n/I18nProvider';
import { useToast } from '../ui/Toast';
import { useOpenDraft } from './useOpenDraft';

const MAX_CAMPAIGN_NAME = 80;

/** The server's answer when the store already has a draft (made on another device, or not in our list yet). */
function isDraftExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'functions/failed-precondition';
}

export function NewReportPage() {
  const { t } = useT();
  const { claims } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const openDraft = useOpenDraft();
  const reports = useStoreReports(claims?.storeId ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftElsewhere, setDraftElsewhere] = useState(false);
  // True from the tap on Start until the server answered: the draft we are creating must not look like an old one.
  const creating = useRef(false);

  const draft = reports.data.find((r) => r.status === 'draft');
  useEffect(() => {
    if (draft && !creating.current) openDraft(draft.id, { replace: true });
    // Only a new draft, or the server saying there is one, opens it; a new `openDraft` callback must not.
  }, [draft?.id, draftElsewhere]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const campaignName = name.trim();
    if (!campaignName || creating.current) return;
    creating.current = true;
    setBusy(true);
    try {
      const { reportId } = await createDraft({ campaignName });
      // Replace the form: Back must not return to /new, which would send the user on to the draft with a notice.
      navigate(`/r/${reportId}`, { replace: true });
    } catch (error) {
      creating.current = false;
      setBusy(false);
      if (isDraftExists(error)) setDraftElsewhere(true);
      else toast(t('error.generic'));
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <h1>{t('store.newReport')}</h1>
      <label className="field">
        <span>{t('store.campaignName')}</span>
        <input
          type="text"
          value={name}
          maxLength={MAX_CAMPAIGN_NAME}
          required
          autoComplete="off"
          enterKeyHint="go"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {draftElsewhere && <p className="form-note" role="status">{t('store.draftExists')}</p>}
      <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy}>{t('store.startReport')}</button>
    </form>
  );
}
