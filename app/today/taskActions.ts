'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';

export async function toggleTask(id: string) {
  const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!task) return;
  db.update(tasks).set({ done: !task.done }).where(eq(tasks.id, id)).run();
  revalidatePath('/today');
  revalidatePath('/tasks');
}

export async function deleteTask(id: string) {
  db.delete(tasks).where(eq(tasks.id, id)).run();
  revalidatePath('/today');
  revalidatePath('/tasks');
}

export async function addTask(title: string, groupId: string, date: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  db.insert(tasks).values({ title: trimmed, date, groupId, important: false, urgent: false, dueDate: null }).run();
  revalidatePath('/today');
  revalidatePath('/tasks');
}
