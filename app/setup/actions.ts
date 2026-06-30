'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { user, vectors, goals } from '@/lib/db/schema';
import { VECTORS } from '@/lib/vectors';
import type { SetupData } from './types';

function quarterBounds(quarter: string): { startDate: string; endDate: string } {
  const [yearStr, qStr] = quarter.split('-Q');
  const year = parseInt(yearStr);
  const q = parseInt(qStr);
  const startMonth = (q - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

export async function completeSetup(data: SetupData) {
  const now = new Date();
  const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  db.insert(user).values({
    id: 1,
    name: data.name.trim() || 'You',
    timezone: data.timezone || 'UTC',
    distanceUnit: data.distanceUnit,
    currency: data.currency,
    weekStart: data.weekStart,
    timeFormat: data.timeFormat,
    lennaTone: data.lennaTone,
    lennaAutonomy: data.lennaAutonomy,
    setupDone: true,
  }).run();

  data.vectors.forEach((key, i) => {
    db.insert(vectors).values({
      id: key,
      label: VECTORS[key].label,
      color: VECTORS[key].color,
      order: i,
    }).run();
  });

  const { startDate, endDate } = quarterBounds(quarter);

  data.vectors.forEach(key => {
    const description = data.goals[key]?.trim();
    if (!description) return;
    db.insert(goals).values({
      vectorId: key,
      quarter,
      description,
      type: 'milestone',
      status: 'active',
      paceShape: 'linear',
      startDate,
      endDate,
    }).run();
  });

  redirect('/today');
}
