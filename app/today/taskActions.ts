'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tasks, taskGroups } from '@/lib/db/schema';

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

export async function deleteGroup(groupId: string): Promise<void> {
  const allGroups = db.select().from(taskGroups).all();
  function descendants(id: string): string[] {
    const kids = allGroups.filter(g => g.parentId === id).map(g => g.id);
    return [id, ...kids.flatMap(descendants)];
  }
  const ids = descendants(groupId);
  for (const id of ids) {
    db.delete(tasks).where(eq(tasks.groupId, id)).run();
    db.delete(taskGroups).where(eq(taskGroups.id, id)).run();
  }
  revalidatePath('/tasks');
}

export async function createGroup(name: string, parentId?: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const siblings = db.select().from(taskGroups).all()
    .filter(g => (g.parentId ?? null) === (parentId ?? null));
  const maxOrder = siblings.reduce((m, g) => Math.max(m, g.order ?? 0), 0);
  db.insert(taskGroups).values({
    name: trimmed,
    parentId: parentId ?? null,
    order: maxOrder + 1,
    isDefault: false,
  }).run();
  revalidatePath('/tasks');
}
