import '../only.ts';
import type { AlbumPublicationBody } from '../../contracts/albums.ts';
import { digest, plainText, positiveInteger } from '../activities/validation.ts';
import { allowedFields, invalidField, operationId } from '../stores/validation.ts';

export function publicationInput(body: Record<string, unknown>) {
  allowedFields(body, ['operationId', 'expectedVersion', 'items']);
  const id = operationId(body);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 10) invalidField();
  const input: AlbumPublicationBody = { operationId: id, expectedVersion: positiveInteger(body.expectedVersion),
    items: body.items.map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) invalidField();
      const item = value as Record<string, unknown>;
      allowedFields(item, ['assetId', 'caption']);
      const assetId = operationId({ operationId: item.assetId });
      return { assetId, caption: plainText(item.caption, 500, true) };
    }) };
  if (new Set(input.items.map(item => item.assetId)).size !== input.items.length) invalidField();
  return { input, id, requestDigest: digest({ expectedVersion: input.expectedVersion, items: input.items }) };
}
