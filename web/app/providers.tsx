'use client';

import { QueryProvider } from '@/shared/providers/query-provider';
import { ThemeProvider } from '@/shared/providers/theme-provider';
import { NotificationProvider } from '@/features/notifications/hooks/use-notifications';
import { MaintenanceProvider } from '@/features/settings/hooks/use-maintenance';
import { WebSocketProvider } from '@/shared/providers/websocket';
import { SearchProvider } from '@/shared/components/search';
import { AuthProvider } from '@/features/auth/components/auth-provider';
import { KeyboardShortcutsProvider } from '@/shared/components/keyboard/keyboard-shortcuts-provider';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryProvider>
        <AuthProvider>
          <NotificationProvider>
            <MaintenanceProvider>
              <SearchProvider>
                <WebSocketProvider>
                  <KeyboardShortcutsProvider>
                    {children}
                  </KeyboardShortcutsProvider>
                </WebSocketProvider>
              </SearchProvider>
            </MaintenanceProvider>
          </NotificationProvider>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
