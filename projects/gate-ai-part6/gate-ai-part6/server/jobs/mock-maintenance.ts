import { getMockService } from '@/server/domains/tests/mock.context';

/**
 * Call from Part 5's daily-maintenance job. Both steps are idempotent and safe to retry.
 *   1. finalise mocks nobody came back to (phone died / tab closed) after deadline + grace
 *   2. heal any failed hand-off of graded mocks into learning state
 */
export async function runMockMaintenance() {
  const svc = getMockService();
  const finalized = await svc.finalizeExpired();
  const healed = await svc.retryPendingLearning();
  return { finalized, healed };
}
