import { getMockService, requireUserId } from '@/server/domains/tests/mock.context';
import { handle } from '../../_lib/http';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/mocks/:id/start — starts the SERVER clock. Idempotent. */
export function POST(_req: Request, { params }: Ctx) {
  return handle(async () => getMockService().start(await requireUserId(), (await params).id));
}
