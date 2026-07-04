import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import SettingsShell from './SettingsShell';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const u = db.select().from(user).get();
  if (!u || !u.setupDone) redirect('/setup');
  return <SettingsShell user={u} />;
}
