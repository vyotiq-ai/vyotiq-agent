/**
 * Tests for JSON Parser utility
 */
import { describe, it, expect } from 'vitest';
import { parseJsonRobust, parseToolArguments } from './jsonParser';

describe('parseJsonRobust', () => {
  it('parses valid JSON directly', () => {
    const result = parseJsonRobust('{"path": "/foo/bar.ts"}');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ path: '/foo/bar.ts' });
    expect(result.recovered).toBe(false);
  });

  it('extracts first object from concatenated JSON', () => {
    // This simulates the streaming bug where two complete JSON objects are concatenated
    const result = parseJsonRobust('{"path": "/foo"}{"oldString": "bar"}');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ path: '/foo' });
    expect(result.recovered).toBe(true);
    expect(result.recoveryMethod).toBe('first-object');
  });

  it('handles JSON with trailing garbage', () => {
    const result = parseJsonRobust('{"path": "/foo"}garbage');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ path: '/foo' });
    expect(result.recovered).toBe(true);
  });

  it('handles JSON with trailing newline garbage', () => {
    const result = parseJsonRobust('{"path": "/foo"}\n{"extra": true}');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ path: '/foo' });
    expect(result.recovered).toBe(true);
  });

  it('handles valid JSON array', () => {
    const result = parseJsonRobust('[1, 2, 3]');
    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.recovered).toBe(false);
  });

  it('handles nested objects correctly', () => {
    const input = '{"config": {"nested": {"deep": true}}}';
    const result = parseJsonRobust(input);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ config: { nested: { deep: true } } });
  });

  it('handles strings with curly braces', () => {
    const input = '{"code": "function test() { return {}; }"}';
    const result = parseJsonRobust(input);
    expect(result.success).toBe(true);
    expect((result.data as { code: string }).code).toBe('function test() { return {}; }');
  });

  it('handles concatenated objects with strings containing braces', () => {
    const input = '{"code": "{}"}{"other": true}';
    const result = parseJsonRobust(input);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ code: '{}' });
    expect(result.recovered).toBe(true);
  });

  it('handles empty input', () => {
    const result = parseJsonRobust('');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Input is empty');
  });

  it('handles non-JSON input', () => {
    const result = parseJsonRobust('not json at all');
    expect(result.success).toBe(false);
  });

  it('removes trailing commas', () => {
    const result = parseJsonRobust('{"a": 1, "b": 2,}');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ a: 1, b: 2 });
    expect(result.recovered).toBe(true);
  });
});

describe('parseToolArguments', () => {
  it('returns empty object for undefined input', () => {
    const result = parseToolArguments(undefined, 'test');
    expect(result).toEqual({});
  });

  it('returns empty object for empty string', () => {
    const result = parseToolArguments('', 'test');
    expect(result).toEqual({});
  });

  it('parses valid tool arguments', () => {
    const result = parseToolArguments('{"path": "/foo", "content": "bar"}', 'edit');
    expect(result).toEqual({ path: '/foo', content: 'bar' });
  });

  it('recovers from concatenated tool arguments', () => {
    const result = parseToolArguments('{"path": "/foo"}{"extra": true}', 'edit');
    expect(result).toEqual({ path: '/foo' });
  });

  it('returns error info for completely invalid JSON', () => {
    const result = parseToolArguments('completely invalid', 'test');
    expect(result._parseError).toBe(true);
    expect(result._errorMessage).toContain('malformed JSON');
    expect(result._rawPreview).toBe('completely invalid');
  });
});
