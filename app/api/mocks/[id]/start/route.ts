import { getMockService, requireUserId } from '@/server/domains/tests/mock.context';
import { handle } from '../../_lib/http';

/** POST /api/mocks/[id]/start — arms the server-held clock and returns the session. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => getMockService().start(await requireUserId(), (await ctx.params).id));
}
