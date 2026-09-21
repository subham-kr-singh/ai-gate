import { redirect } from 'next/navigation';
import { requireUserId } from '@/server/domains/tests/mock.context';
import { UnauthorizedError } from '@/server/domains/tests/mock.types';

/** Page-level auth: unauthenticated visitors go to the Part 1 login page. */
export async function userIdOrLogin(): Promise<string> {
  try {
    return await requireUserId();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/login');
    throw e;
  }
}
