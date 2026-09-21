import { getMockService, requireUserId } from '@/server/domains/tests/mock.context';
import { handle } from '../_lib/http';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/mocks/:id — resume snapshot (questions, saved answers, deadline, server time). */
export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => getMockService().getSession(await requireUserId(), (await params).id));
}
