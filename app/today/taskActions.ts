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
}

export async function deleteTask(id: string) {
  db.delete(tasks).where(eq(tasks.id, id)).run();
  revalidatePath('/today');
}

export async function setTaskPriority(id: string, important: boolean, urgent: boolean) {
  db.update(tasks).set({ important, urgent }).where(eq(tasks.id, id)).run();
  revalidatePath('/today');
}

export async function setTaskDueDate(id: string, dueDate: string | null) {
  db.update(tasks).set({ dueDate }).where(eq(tasks.id, id)).run();
  revalidatePath('/today');
}

export async function setTaskGroup(id: string, groupId: string) {
  db.update(tasks).set({ groupId }).where(eq(tasks.id, id)).run();
  revalidatePath('/today');
}
