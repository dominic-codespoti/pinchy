'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Palette,
  Bell,
  Shield,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/shared/components/page-container';
import { cn } from '@/shared/lib/utils';

interface SettingsNavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const settingsNavItems: SettingsNavItem[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    href: '/settings/appearance',
    icon: <Palette className="h-4 w-4" />,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    href: '/settings/notifications',
    icon: <Bell className="h-4 w-4" />,
  },
  {
    id: 'security',
    label: 'Security',
    href: '/settings/security',
    icon: <Shield className="h-4 w-4" />,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    href: '/settings/advanced',
    icon: <Settings2 className="h-4 w-4" />,
  },
];

interface SettingsLayoutProps {
  children: React.ReactNode;
}

function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1">
      {settingsNavItems.map((item) => {
        const isActive = pathname === item.href || 
          (item.href !== '/settings' && pathname.startsWith(item.href));
        return (
          <Button
            key={item.id}
            variant={isActive ? 'secondary' : 'ghost'}
            size="sm"
            asChild
            className={cn(
              'gap-2',
              isActive && 'bg-secondary font-medium'
            )}
          >
            <Link href={item.href}>
              {item.icon}
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

export function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <PageContainer maxWidth="narrow" className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your application preferences and configuration</p>
      </div>

      {/* Tab navigation */}
      <SettingsTabs />

      {/* Content */}
      {children}
    </PageContainer>
  );
}

export { settingsNavItems };
export type { SettingsNavItem };
