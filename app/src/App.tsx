import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { AppRoutes } from './routes';
import { ToastProvider } from './ui/Toast';

export function App() {
  return (
    <AuthProvider>
      <I18nProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
