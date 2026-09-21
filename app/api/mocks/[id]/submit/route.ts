import { getMockService, requireUserId } from '@/server/domains/tests/mock.context';
import { submitBody } from '@/server/domains/tests/mock.schemas';
import { handle, readJson } from '../../_lib/http';

/** POST /api/mocks/[id]/submit — final submission. Carries any last unsent
 * autosave events so answers given just before the bell are not lost. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const body = submitBody.parse(await readJson(req));
    return getMockService().submit(userId, (await ctx.params).id, body);
  });
}
