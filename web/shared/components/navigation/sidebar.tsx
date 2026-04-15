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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/shared/lib/utils';
import { ThemeSwitcher } from '@/features/theme-editor/components/theme-switcher';
import { ConnectionStatus } from '@/shared/components/connection-status';
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
  ChevronRight,
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
      <TabsList className="flex h-auto w-full flex-col items-stretch justify-start gap-1.5 bg-transparent p-0">
        {navItems.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            asChild
            className={cn(
              'group h-12 w-full rounded-xl border border-transparent px-3 data-[state=active]:border-border/70 data-[state=active]:bg-secondary/90 data-[state=active]:shadow-none'
            )}
          >
            <Link href={item.href} prefetch={true} onClick={onNavigate}>
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg border border-transparent bg-transparent text-muted-foreground transition-colors group-data-[state=active]:border-border/60 group-data-[state=active]:bg-background/80 group-data-[state=active]:text-foreground">
                  <item.icon className="size-4" />
                </span>
                <span className="truncate">{item.label}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/60 group-data-[state=active]:text-muted-foreground/80" />
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function SidebarHeaderContent() {
  return (
    <CardHeader className="border-b px-4 py-5">
      <div className="space-y-1.5">
        <CardTitle className="text-lg font-semibold tracking-tight">Pinchy</CardTitle>
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Operations Console</p>
      </div>
    </CardHeader>
  );
}

function SidebarFooterContent() {
  return (
    <CardFooter className="border-t bg-background/95 p-4 pt-4">
      <SidebarUtilityBar />
    </CardFooter>
  );
}

function SidebarUtilityBar() {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <ConnectionStatus showLabel pulse showTooltip={false} />
      <ThemeSwitcher
        variant="ghost"
        size="sm"
        showLabel
        className="min-w-0 h-8 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
      />
    </div>
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
            className="fixed right-4 top-4 z-40 rounded-full border border-border/70 bg-background/90 shadow-sm backdrop-blur lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu data-icon="default" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col p-0">
          <SheetHeader className="border-b px-4 py-5 text-left">
            <div className="space-y-1.5 pr-10">
              <SheetTitle className="text-lg font-semibold tracking-tight">Pinchy</SheetTitle>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Operations Console</p>
            </div>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4 pb-6">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </ScrollArea>
          <div className="border-t p-4">
            <SidebarUtilityBar />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <Card className="sticky top-0 hidden h-screen w-72 flex-col rounded-none border-y-0 border-l-0 border-r border-border/70 bg-gradient-to-b from-background via-background to-muted/20 shadow-none lg:flex">
        <SidebarHeaderContent />
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              <NavLinks />
            </div>
          </ScrollArea>
        </CardContent>
        <SidebarFooterContent />
      </Card>
    </>
  );
}

Sidebar.displayName = 'Sidebar';
