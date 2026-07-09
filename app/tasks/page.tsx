import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, tasks, taskGroups } from '@/lib/db/schema';
import TasksShell from './TasksShell';

export const dynamic = 'force-dynamic';

export default function TasksPage() {
  const u = db.select().from(user).get();
  if (!u || !u.setupDone) redirect('/setup');

  const now   = new Date();
  const today = now.toISOString().split('T')[0];

  const groups   = db.select().from(taskGroups).orderBy(asc(taskGroups.order)).all();
  const allTasks = db.select().from(tasks).orderBy(asc(tasks.createdAt)).all();

  return (
    <TasksShell
      groups={groups}
      tasks={allTasks}
      today={today}
    />
  );
}
