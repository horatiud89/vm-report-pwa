import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';
import { useToast } from '../ui/Toast';

/** A store has one draft at a time: when it asks for a new report, open the existing draft and say so. */
export function useOpenDraft(): (reportId: string, options?: { replace?: boolean }) => void {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  return useCallback((reportId, options) => {
    toast(t('store.draftExists'));
    navigate(`/r/${reportId}`, { replace: options?.replace ?? false });
  }, [t, toast, navigate]);
}
