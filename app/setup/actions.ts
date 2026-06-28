'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { user, vectors, goals } from '@/lib/db/schema';
import { VECTORS } from '@/lib/vectors';
import type { SetupData } from './types';

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

  data.vectors.forEach(key => {
    const description = data.goals[key]?.trim();
    if (!description) return;
    db.insert(goals).values({
      vectorId: key,
      quarter,
      description,
      type: 'milestone',
      paceType: 'linear',
      active: true,
    }).run();
  });

  redirect('/today');
}
