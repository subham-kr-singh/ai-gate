import { getMockService, requireUserId } from '@/server/domains/tests/mock.context';
import { submitBody } from '@/server/domains/tests/mock.schemas';
import { handle, readJson } from '../../_lib/http';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/mocks/:id/submit — idempotent. Unsent outbox events ride along in `events`. */
export function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const userId = await requireUserId();
    const { reason, events } = submitBody.parse(await readJson(req));
    return getMockService().submit(userId, (await params).id, { reason, events });
  });
}
