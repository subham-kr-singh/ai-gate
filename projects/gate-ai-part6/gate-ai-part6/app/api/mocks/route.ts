import { getMockService, requireUserId } from '@/server/domains/tests/mock.context';
import { createMockBody } from '@/server/domains/tests/mock.schemas';
import { handle, readJson } from './_lib/http';

/** GET /api/mocks — active, ready and past mocks + readiness. */
export function GET() {
  return handle(async () => getMockService().list(await requireUserId()));
}

/** POST /api/mocks — assemble a paper. The clock does NOT start here. */
export function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    const body = createMockBody.parse(await readJson(req));
    return getMockService().create(userId, body);
  }, 201);
}
