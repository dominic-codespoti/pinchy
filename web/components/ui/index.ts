// UI Components Barrel Export
// Wave 2 Integration - All UI components exported from single entry point

// Base components
export { Button, buttonVariants, type ButtonProps } from './button';
export { Input } from './input';
export { Textarea } from './textarea';
export { Label } from './label';

// Layout components
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './card';
export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription } from './sheet';
export { ScrollArea, ScrollBar } from './scroll-area';
export { Separator } from './separator';

// Navigation components
export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator } from './command';

// Form components
export { Checkbox } from './checkbox';
export { Switch } from './switch';
export { RadioGroup, RadioGroupItem } from './radio-group';
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton } from './select';
export { Slider } from './slider';

// Display components
export { Badge, badgeVariants, type BadgeProps } from './badge';
export { Progress } from './progress';
export { Skeleton } from './skeleton';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { PageSkeleton, CardGridSkeleton, type PageSkeletonProps, type CardGridSkeletonProps } from './page-skeleton';
export { Avatar, AvatarImage, AvatarFallback } from './avatar';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip';
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from './popover';
export { HoverCard, HoverCardTrigger, HoverCardContent } from './hover-card';

// Dialog components
export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from './dialog';
export { AlertDialog, AlertDialogPortal, AlertDialogOverlay, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from './alert-dialog';

// Feedback components
export { Alert, AlertTitle, AlertDescription } from './alert';

// Menu components
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup } from './dropdown-menu';
export { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuCheckboxItem, ContextMenuRadioItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuGroup, ContextMenuPortal, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuRadioGroup } from './context-menu';

// Tabs and accordion
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './accordion';
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from './collapsible';

// Table
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption } from './table';

// Toggle
export { ToggleGroup, ToggleGroupItem } from './toggle-group';

// Calendar
export { Calendar } from './calendar';

// Custom UI components (Wave 2 additions)
export { DataTable } from './data-table';
export { FormSection } from './form-section';
export { FormField } from './form-field';
export { InfoBlock } from './info-block';
export { MetricCard, type MetricCardProps } from './metric-card';
export { Indicator, type IndicatorProps } from './indicator';
export { StatusPill, type StatusPillVariant } from './status-pill';
export { MobileCard } from './mobile-card';

// Layout components (shadcn-based)
export { Stack, VStack, HStack, FlexBetween, type StackProps } from './stack';
export { Container, type ContainerProps } from './container';

// Typography components (shadcn-based)
export { H1, H2, H3, H4, Text, Muted, Lead, Small } from './typography';
