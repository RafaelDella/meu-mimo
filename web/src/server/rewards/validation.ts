import '../only.ts';
import type { RewardFields } from '../../contracts/rewards.ts';
import { digest, plainText, positiveInteger } from '../activities/validation.ts';
import { invalidField } from '../stores/validation.ts';

export { digest, positiveInteger };
export const rewardFields = ['name', 'description', 'category', 'sticker', 'cost', 'note', 'instructions', 'available', 'stock'] as const;

export function configuration(body: Record<string, unknown>): RewardFields {
  const sticker = body.sticker === undefined ? 'gift' : body.sticker;
  const available = body.available === undefined ? true : body.available;
  const stock = body.stock === undefined ? null : body.stock;
  if (typeof sticker !== 'string' || !['gift', 'coffee', 'takeout', 'envelope'].includes(sticker) ||
      typeof available !== 'boolean' || (stock !== null &&
      (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0 || stock > 1_000_000))) invalidField();
  return { name: plainText(body.name, 80), description: plainText(body.description, 1_000, true),
    category: plainText(body.category, 80, true), sticker: sticker as RewardFields['sticker'],
    cost: positiveInteger(body.cost, 1_000_000), note: plainText(body.note, 500, true),
    instructions: plainText(body.instructions, 1_000, true), available, stock: stock as number | null };
}
