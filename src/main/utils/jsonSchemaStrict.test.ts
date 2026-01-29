import { describe, expect, test } from 'vitest';
import { normalizeStrictJsonSchema } from './jsonSchemaStrict';

describe('normalizeStrictJsonSchema', () => {
  test('adds additionalProperties:false and requires all keys', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
      },
      required: ['a'],
    };

    const normalized = normalizeStrictJsonSchema(schema);

    expect(normalized.type).toBe('object');
    expect(normalized.additionalProperties).toBe(false);
    expect(normalized.required).toEqual(['a', 'b']);

    const props = normalized.properties as Record<string, Record<string, unknown>>;
    expect(props.a.type).toBe('string');
    // optional -> nullable
    expect(props.b.type).toEqual(['number', 'null']);
  });

  test('recurses into nested objects and arrays', () => {
    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              x: { type: 'string' },
            },
          },
        },
      },
    };

    const normalized = normalizeStrictJsonSchema(schema);
    const props = normalized.properties as Record<string, Record<string, unknown>>;

    expect(normalized.required).toEqual(['items']);
    expect(normalized.additionalProperties).toBe(false);

    const itemsSchema = props.items as Record<string, unknown>;
    const itemItemsSchema = itemsSchema.items as Record<string, unknown>;
    expect(itemItemsSchema.additionalProperties).toBe(false);
    expect(itemItemsSchema.required).toEqual(['x']);
  });
});
