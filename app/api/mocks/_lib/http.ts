import { ZodError } from 'zod';
import {
  ActiveMockExistsError,
  InsufficientQuestionBankError,
  MockNotFoundError,
  MockStateError,
  UnauthorizedError,
} from '@/server/domains/tests/mock.types';

/** Thin HTTP shell: run a domain call, map domain errors to status codes. No business logic here. */
export async function handle(fn: () => Promise<unknown>, okStatus = 200): Promise<Response> {
  try {
    return Response.json(await fn(), { status: okStatus, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof ZodError) return fail(400, 'BAD_REQUEST', 'Invalid request body', { issues: err.issues });
    if (err instanceof UnauthorizedError) return fail(401, err.code, err.message);
    if (err instanceof MockNotFoundError) return fail(404, err.code, err.message);
    if (err instanceof MockStateError) return fail(409, err.code, err.message);
    if (err instanceof ActiveMockExistsError) return fail(409, err.code, err.message, { activeMockId: err.activeMockId });
    if (err instanceof InsufficientQuestionBankError) return fail(422, err.code, err.message, { shortfalls: err.shortfalls });
    console.error('[api/mocks]', err);
    return fail(500, 'INTERNAL', 'Something went wrong');
  }
}

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: { code, message, ...extra } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
