/**
 * JSON Schema strict-mode normalizer
 *
 * OpenAI tool calling in `strict: true` mode expects object schemas to:
 * - include `additionalProperties: false`
 * - include `required` that lists *all* property keys
 *
 * To preserve optional semantics, we treat any property not present in the
 * original `required` list as "optional" and make it nullable (adds `null`)
 * while still adding it to `required`.
 */

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function addNullability(schema: unknown): unknown {
  if (!isPlainObject(schema)) return schema;

  // If explicit type exists, extend it to include null.
  const type = schema.type;
  if (typeof type === 'string') {
    if (type === 'null') return schema;
    return { ...schema, type: [type, 'null'] };
  }
  if (Array.isArray(type)) {
    if (type.includes('null')) return schema;
    return { ...schema, type: [...type, 'null'] };
  }

  // If schema uses anyOf/oneOf, append a null branch.
  const anyOf = schema.anyOf;
  if (Array.isArray(anyOf)) {
    const alreadyNullable = anyOf.some((v) => isPlainObject(v) && v.type === 'null');
    return alreadyNullable ? schema : { ...schema, anyOf: [...anyOf, { type: 'null' }] };
  }

  const oneOf = schema.oneOf;
  if (Array.isArray(oneOf)) {
    const alreadyNullable = oneOf.some((v) => isPlainObject(v) && v.type === 'null');
    // Prefer anyOf when adding null to avoid oneOf exclusivity issues.
    return alreadyNullable ? schema : { ...schema, anyOf: [...oneOf, { type: 'null' }], oneOf: undefined };
  }

  // Fallback: wrap original schema in anyOf including null.
  return { anyOf: [schema, { type: 'null' }] };
}

function normalize(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(normalize);
  if (!isPlainObject(schema)) return schema;

  const result: JsonObject = { ...schema };

  // Recurse common JSON Schema locations
  if ('properties' in result && isPlainObject(result.properties)) {
    const properties = result.properties as Record<string, unknown>;
    const propertyKeys = Object.keys(properties);

    const originalRequired = Array.isArray(result.required)
      ? (result.required as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    const originalRequiredSet = new Set(originalRequired);

    const normalizedProperties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      const normalizedValue = normalize(value);
      // If it was not originally required, preserve optionality by allowing null.
      normalizedProperties[key] = originalRequiredSet.has(key) ? normalizedValue : addNullability(normalizedValue);
    }

    result.type = typeof result.type === 'string' ? result.type : 'object';
    result.properties = normalizedProperties;

    // Strict mode: require all keys.
    result.required = propertyKeys;

    // Strict mode: forbid extra keys.
    if (result.additionalProperties === undefined) {
      result.additionalProperties = false;
    }
  }

  if ('items' in result) {
    result.items = normalize(result.items);
  }

  if ('anyOf' in result && Array.isArray(result.anyOf)) {
    result.anyOf = (result.anyOf as unknown[]).map(normalize);
  }
  if ('allOf' in result && Array.isArray(result.allOf)) {
    result.allOf = (result.allOf as unknown[]).map(normalize);
  }
  if ('oneOf' in result && Array.isArray(result.oneOf)) {
    result.oneOf = (result.oneOf as unknown[]).map(normalize);
  }

  if ('additionalProperties' in result && isPlainObject(result.additionalProperties)) {
    result.additionalProperties = normalize(result.additionalProperties);
  }

  return result;
}

export function normalizeStrictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalize(schema);
  return (isPlainObject(normalized) ? normalized : {}) as Record<string, unknown>;
}
