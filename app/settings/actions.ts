'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

export async function saveSettings(formData: FormData): Promise<{ error?: string }> {
  const name        = (formData.get('name') as string)?.trim();
  const timezone    = (formData.get('timezone') as string)?.trim();
  const weekStart   = formData.get('weekStart') as 'mon' | 'sun';
  const timeFormat  = formData.get('timeFormat') as '24h' | '12h';
  const lennaTone   = formData.get('lennaTone') as 'warm' | 'neutral' | 'direct';
  const darkMode    = formData.get('darkMode') === 'true';

  if (!name) return { error: 'Name is required.' };
  if (!timezone) return { error: 'Timezone is required.' };

  db.update(user).set({ name, timezone, weekStart, timeFormat, lennaTone, darkMode }).run();

  revalidatePath('/today');
  revalidatePath('/quarter');
  revalidatePath('/tasks');
  revalidatePath('/settings');
  return {};
}
