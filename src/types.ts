import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/** Status enum for OpenAI completion task states */
export enum CompletionStatusEnum {
  /** Task has been created but not started */
  Pending = 'pending',
  /** Task is currently being processed */
  Processing = 'processing',
  /** Task has completed successfully */
  Complete = 'complete',
  /** Task encountered an error */
  Error = 'error',
}

/** Arguments for the OpenAI completion tool */
export interface CompletionArgs {
  /** The text prompt to complete */
  prompt: string;
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Controls randomness (0-1) */
  temperature?: number;
  /** Controls diversity via nucleus sampling */
  top_p?: number;
  /** Decreases repetition of token sequences */
  frequency_penalty?: number;
  /** Increases likelihood of talking about new topics */
  presence_penalty?: number;
}

/** OpenAI completion response data */
export interface CompletionResponse {
  /** The generated text */
  text: string;
  /** The model used for completion */
  model: string;
  /** The reason why the completion finished */
  finish_reason?: string;
  /** Token usage statistics */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Information about an ongoing completion task */
export interface CompletionTask {
  /** Current status of the task */
  status: CompletionStatusEnum;
  /** Result of the completion if successful */
  result?: CompletionResponse;
  /** Error message if task failed */
  error?: string;
  /** Timestamp when the task was created */
  created_at: number;
  /** Timestamp when the task will timeout */
  timeout_at: number;
  /** Progress of the task (0-100) */
  progress: number;
  /** Abort controller to cancel the task */
  abortController: AbortController;
}

/** Base class for OpenAI completion related errors */
export class CompletionError extends Error {
  constructor(
    message: string,
    public code: ErrorCode = ErrorCode.InvalidRequest
  ) {
    super(message);
    this.name = 'CompletionError';
  }
}

/** Error thrown when a completion request times out */
export class CompletionTimeoutError extends CompletionError {
  constructor(message = 'OpenAI API request timed out') {
    super(message, ErrorCode.InvalidRequest);
    this.name = 'CompletionTimeoutError';
  }
}

/** Error thrown when a completion request is cancelled */
export class CompletionCancelledError extends CompletionError {
  constructor(message = 'OpenAI API request was cancelled') {
    super(message, ErrorCode.InvalidRequest);
    this.name = 'CompletionCancelledError';
  }
} 