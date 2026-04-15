'use client';

import { redirect } from 'next/navigation';

// Theme settings have been merged into Appearance
export default function ThemeSettingsPage() {
  redirect('/settings/appearance');
}
