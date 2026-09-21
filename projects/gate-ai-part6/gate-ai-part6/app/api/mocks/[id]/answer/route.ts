import { getMockService, requireUserId } from '@/server/domains/tests/mock.context';
import { answerBody } from '@/server/domains/tests/mock.schemas';
import { handle, readJson } from '../../_lib/http';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/mocks/:id/answer — seq-guarded, idempotent autosave.
 * `{ events: [] }` is a heartbeat: returns serverNowMs + deadlineAtMs for clock calibration.
 */
export function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const userId = await requireUserId();
    const { events } = answerBody.parse(await readJson(req));
    return getMockService().applyEvents(userId, (await params).id, events);
  });
}
