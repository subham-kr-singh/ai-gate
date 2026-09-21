import { z } from 'zod';

const answerValue = z.union([z.string().max(64), z.array(z.string().max(16)).max(8), z.null()]);

export const eventSchema = z.object({
  seq: z.number().int().positive(),
  questionId: z.string().min(1).max(64),
  kind: z.enum(['SELECT', 'CLEAR', 'MARK', 'UNMARK', 'GUESS', 'UNGUESS', 'VISIT', 'LEAVE', 'TIME']),
  selected: answerValue.optional(),
  spentMs: z.number().int().min(0).max(3_600_000).optional(),
  at: z.number().int().positive(),
});

export const createMockBody = z.object({
  blueprintKey: z.string().min(1).max(64).optional(),
  preferUnseen: z.boolean().optional(),
});

export const answerBody = z.object({ events: z.array(eventSchema).max(500) });

export const submitBody = z.object({
  reason: z.enum(['USER', 'TIMER']).default('USER'),
  events: z.array(eventSchema).max(500).optional(),
});
