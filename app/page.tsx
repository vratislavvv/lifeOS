import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

export default function Home() {
  let setupDone = false;
  try {
    const u = db.select().from(user).get();
    setupDone = u?.setupDone ?? false;
  } catch {
    // DB not yet initialised (before db:push) — default to setup
  }
  redirect(setupDone ? '/today' : '/setup');
}
