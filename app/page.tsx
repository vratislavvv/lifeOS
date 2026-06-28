import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

export default function Home() {
  try {
    const u = db.select().from(user).get();
    redirect(u?.setupDone ? '/today' : '/setup');
  } catch {
    // DB not yet initialised (before db:push) — send to setup
    redirect('/setup');
  }
}
