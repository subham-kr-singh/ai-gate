import { notFound, redirect } from 'next/navigation';
import { MockSimulator } from '@/components/mocks/MockSimulator';
import { getMockService } from '@/server/domains/tests/mock.context';
import { MockNotFoundError, type MockSessionSnapshot } from '@/server/domains/tests/mock.types';
import { userIdOrLogin } from '../_lib';

export const dynamic = 'force-dynamic';

export default async function MockPage({ params }: { params: Promise<{ mockId: string }> }) {
  const { mockId } = await params;
  const userId = await userIdOrLogin();

  let snapshot: MockSessionSnapshot;
  try {
    snapshot = await getMockService().getSession(userId, mockId);
  } catch (e) {
    if (e instanceof MockNotFoundError) notFound();
    throw e;
  }
  if (snapshot.status === 'SUBMITTED') redirect(`/mocks/${mockId}/result`);

  return <MockSimulator snapshot={snapshot} />;
}
