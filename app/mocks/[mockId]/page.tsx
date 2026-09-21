import { notFound } from 'next/navigation';
import { MockSimulator } from '@/components/mocks/MockSimulator';
import { getMockService } from '@/server/domains/tests/mock.context';
import { MockNotFoundError } from '@/server/domains/tests/mock.types';
import { userIdOrLogin } from '../_lib';

export const dynamic = 'force-dynamic';

/** The exam surface intentionally renders without AppShell: an exam is a
 * focus mode, and MockSimulator draws its own full-bleed chrome. */
export default async function MockSessionPage({ params }: { params: Promise<{ mockId: string }> }) {
  const userId = await userIdOrLogin();
  const { mockId } = await params;

  const snapshot = await getMockService()
    .getSession(userId, mockId)
    .catch((e) => {
      if (e instanceof MockNotFoundError) notFound();
      throw e;
    });

  if (snapshot.status === 'SUBMITTED') {
    // Already finished — send them to the result instead of a dead exam screen.
    const { redirect } = await import('next/navigation');
    redirect(`/mocks/${mockId}/result`);
  }

  return <MockSimulator snapshot={snapshot} />;
}
