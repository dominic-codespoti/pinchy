'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/shared/lib/utils';
import { ThemeSwitcher } from '@/features/theme-editor/components/theme-switcher';
import { ConnectionStatus } from '@/shared/components/connection-status';
import { SearchTrigger } from '@/shared/components/search/trigger';
import { NotificationCenter } from '@/features/notifications/components/notification-center';
import {
  LayoutDashboard,
  Bot,
  Calendar,
  Lightbulb,
  ScrollText,
  Settings,
  Menu,
  Cpu,
  MessageSquare,
  Brain,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, value: 'dashboard' },
  { href: '/chat', label: 'Chat', icon: MessageSquare, value: 'chat' },
  { href: '/agents', label: 'Agents', icon: Bot, value: 'agents' },
  { href: '/memories', label: 'Memories', icon: Brain, value: 'memories' },
  { href: '/cron', label: 'Cron', icon: Calendar, value: 'cron' },
  { href: '/skills', label: 'Skills', icon: Lightbulb, value: 'skills' },
  { href: '/logs', label: 'Logs', icon: ScrollText, value: 'logs' },
  { href: '/models', label: 'Models', icon: Cpu, value: 'models' },
  { href: '/settings', label: 'Settings', icon: Settings, value: 'settings' },
];

function getCurrentTab(pathname: string): string {
  const item = navItems.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
  return item?.value ?? 'dashboard';
}

interface NavLinksProps {
  onNavigate?: () => void;
}

function NavLinks({ onNavigate }: NavLinksProps) {
  const pathname = usePathname();
  const currentTab = getCurrentTab(pathname);

  return (
    <Tabs value={currentTab} orientation="vertical" className="w-full">
      <TabsList className="flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0">
        {navItems.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            asChild
            className={cn(
              'w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-secondary data-[state=active]:shadow-none'
            )}
          >
            <Link href={item.href} onClick={onNavigate}>
              <item.icon data-icon="inline-start" />
              {item.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function SidebarHeaderContent() {
  return (
    <CardHeader className="flex h-14 flex-row items-center justify-between border-b px-4 py-0">
      <CardTitle className="text-base font-semibold">Pinchy</CardTitle>
      <div className="flex items-center gap-1">
        <NotificationCenter />
        <SearchTrigger size="icon" showText={false} showShortcut={false} />
      </div>
    </CardHeader>
  );
}

function SidebarFooterContent() {
  return (
    <CardFooter className="flex flex-col items-stretch gap-4 p-4">
      <Separator />
      <div className="flex items-center gap-2">
        <ConnectionStatus showLabel pulse />
      </div>
      <div className="flex items-center justify-center">
        <ThemeSwitcher />
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Pinchy v0.1.19
      </p>
    </CardFooter>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile Sheet Navigation */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed left-4 top-4 z-40 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu data-icon="default" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="flex h-14 flex-row items-center justify-between border-b px-4">
            <SheetTitle className="text-base font-semibold">Pinchy</SheetTitle>
            <div className="flex items-center gap-1">
              <NotificationCenter />
              <SearchTrigger size="icon" showText={false} showShortcut={false} />
            </div>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-7rem-1px)]">
            <div className="p-4">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </ScrollArea>
          <div className="border-t">
            <div className="flex flex-col gap-4 p-4">
              <div className="flex items-center gap-2">
                <ConnectionStatus showLabel pulse />
              </div>
              <div className="flex items-center justify-center">
                <ThemeSwitcher />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Pinchy v0.1.19
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <Card className="hidden lg:flex h-screen w-64 flex-col sticky top-0 rounded-none border-r border-y-0 border-l-0 shadow-none">
        <SidebarHeaderContent />
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full p-4">
            <NavLinks />
          </ScrollArea>
        </CardContent>
        <SidebarFooterContent />
      </Card>
    </>
  );
}

Sidebar.displayName = 'Sidebar';
