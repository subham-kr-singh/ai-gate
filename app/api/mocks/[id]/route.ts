import { getMockService, requireUserId } from '@/server/domains/tests/mock.context';
import { handle } from '../_lib/http';

/** GET /api/mocks/[id] — resume snapshot (answers, clock, sections). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => getMockService().getSession(await requireUserId(), (await ctx.params).id));
}
