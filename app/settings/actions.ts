'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

export async function saveSettings(formData: FormData): Promise<{ error?: string }> {
  const name          = (formData.get('name') as string)?.trim();
  const timezone      = (formData.get('timezone') as string)?.trim();
  const weekStart     = formData.get('weekStart') as 'mon' | 'sun';
  const timeFormat    = formData.get('timeFormat') as '24h' | '12h';
  const distanceUnit  = formData.get('distanceUnit') as 'km' | 'mi';
  const currency      = (formData.get('currency') as string)?.trim();
  const lennaTone     = formData.get('lennaTone') as 'warm' | 'neutral' | 'direct';
  const lennaAutonomy = formData.get('lennaAutonomy') as 'suggest' | 'draft' | 'act';
  const darkMode      = formData.get('darkMode') === 'true';

  if (!name)     return { error: 'Name is required.' };
  if (!timezone) return { error: 'Timezone is required.' };

  db.update(user).set({ name, timezone, weekStart, timeFormat, distanceUnit, currency, lennaTone, lennaAutonomy, darkMode }).run();

  revalidatePath('/today');
  revalidatePath('/quarter');
  revalidatePath('/tasks');
  revalidatePath('/settings');
  return {};
}

export async function disconnectGoogle(): Promise<void> {
  db.update(user).set({
    googleRefreshToken:       null,
    googleConnectedAt:        null,
    googleHealthRefreshToken: null,
    googleHealthConnectedAt:  null,
  }).run();
  revalidatePath('/settings');
  revalidatePath('/today');
}

export async function generateHealthToken(): Promise<{ token: string }> {
  const token = crypto.randomUUID().replace(/-/g, '');
  db.update(user).set({ healthSyncToken: token }).run();
  revalidatePath('/settings');
  return { token };
}
