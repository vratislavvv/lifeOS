import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import SetupFlow from './SetupFlow';

export const dynamic = 'force-dynamic';

export default function SetupPage() {
  const u = db.select().from(user).get();
  return (
    <SetupFlow
      googleConnected={!!u?.googleRefreshToken}
      googleHealthConnected={!!u?.googleHealthRefreshToken}
    />
  );
}
