import { getMockService, requireUserId } from '@/server/domains/tests/mock.context';
import { answerBody } from '@/server/domains/tests/mock.schemas';
import { handle, readJson } from '../../_lib/http';

/** POST /api/mocks/[id]/answer — batched autosave. The ack carries the server
 * clock so the client can re-calibrate its countdown against clock drift. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const body = answerBody.parse(await readJson(req));
    return getMockService().applyEvents(userId, (await ctx.params).id, body.events);
  });
}
