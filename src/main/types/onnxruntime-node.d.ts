/**
 * Type declarations for onnxruntime-node
 * Minimal type definitions for the features we use
 */
declare module 'onnxruntime-node' {
  export class Tensor {
    constructor(
      type: 'float32' | 'int32' | 'int64' | 'bool' | 'string',
      data: Float32Array | Int32Array | BigInt64Array | boolean[] | string[],
      dims: number[]
    );
    readonly data: Float32Array | Int32Array | BigInt64Array | boolean[] | string[];
    readonly dims: readonly number[];
    readonly type: string;
  }

  export interface SessionOptions {
    executionProviders?: string[];
    graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
  }

  export interface RunOptions {
    logSeverityLevel?: number;
  }

  export interface OnnxValue {
    data: Float32Array | Int32Array | BigInt64Array | boolean[] | string[];
    dims: readonly number[];
    type: string;
  }

  export class InferenceSession {
    static create(path: string, options?: SessionOptions): Promise<InferenceSession>;
    run(
      feeds: Record<string, Tensor>,
      options?: RunOptions
    ): Promise<Record<string, OnnxValue>>;
    readonly inputNames: readonly string[];
    readonly outputNames: readonly string[];
  }
}
