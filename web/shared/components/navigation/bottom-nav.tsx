'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/shared/lib/utils';
import {
  LayoutDashboard,
  Bot,
  MoreHorizontal,
  Calendar,
  Lightbulb,
  ScrollText,
  Settings,
  Cpu,
  MessageSquare,
  Brain,
} from 'lucide-react';

const mainNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, value: 'dashboard' },
  { href: '/chat', label: 'Chat', icon: MessageSquare, value: 'chat' },
  { href: '/agents', label: 'Agents', icon: Bot, value: 'agents' },
  { href: '/memories', label: 'Memories', icon: Brain, value: 'memories' },
  { href: '/cron', label: 'Cron', icon: Calendar, value: 'cron' },
];

const moreNavItems = [
  { href: '/skills', label: 'Skills', icon: Lightbulb, value: 'skills' },
  { href: '/logs', label: 'Logs', icon: ScrollText, value: 'logs' },
  { href: '/models', label: 'Models', icon: Cpu, value: 'models' },
  { href: '/settings', label: 'Settings', icon: Settings, value: 'settings' },
];

function getActiveValue(pathname: string): string {
  const allItems = [...mainNavItems, ...moreNavItems];
  const item = allItems.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
  return item?.value ?? '';
}

function isItemActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  const activeValue = getActiveValue(pathname);

  return (
    <ToggleGroup
      type="single"
      value={activeValue}
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden h-16 w-full rounded-none border-t bg-background p-0 data-[state=open]:bg-accent"
      aria-label="Mobile navigation"
    >
      {mainNavItems.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          asChild
          className={cn(
            'h-full flex-1 flex-col gap-1 rounded-none border-0 p-0 data-[state=on]:bg-transparent data-[state=on]:text-primary'
          )}
          aria-label={item.label}
          aria-current={isItemActive(item.href, pathname) ? 'page' : undefined}
        >
          <Link href={item.href}>
            <item.icon data-icon="default" />
            <span className="text-xs">{item.label}</span>
          </Link>
        </ToggleGroupItem>
      ))}

      {/* More options sheet */}
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            className="h-full flex-1 flex-col gap-1 rounded-none p-0 hover:bg-accent hover:text-accent-foreground"
            aria-label="More navigation options"
          >
            <MoreHorizontal data-icon="default" aria-hidden="true" />
            <span className="text-xs">More</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-auto max-h-[70vh]">
          <SheetHeader className="mb-4">
            <SheetTitle>More Options</SheetTitle>
          </SheetHeader>
          <Tabs value={activeValue} className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0">
              {moreNavItems.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  asChild
                  className={cn(
                    'h-12 w-full justify-start gap-3 data-[state=active]:bg-secondary data-[state=active]:shadow-none'
                  )}
                >
                  <Link href={item.href}>
                    <item.icon data-icon="default" />
                    {item.label}
                  </Link>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Safe area padding for iOS */}
      <div className="fixed bottom-0 left-0 right-0 h-safe-area-inset-bottom bg-background" aria-hidden="true" />
    </ToggleGroup>
  );
}

BottomNav.displayName = 'BottomNav';
