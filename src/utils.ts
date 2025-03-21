import { DEBUG } from './constants.js';
import { CompletionArgs } from './types.js';

type LogArgs = string | number | boolean | null | undefined | object;
type LogLevel = 'INFO' | 'ERROR' | 'DEBUG' | 'WARN';

/**
 * Helper function to log messages with timestamp and context
 */
const logMessage = (
  level: LogLevel,
  context: string,
  message: string,
  ...args: LogArgs[]
): void => {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${level}] [${context}] ${message}`;

  switch (level) {
    case 'ERROR':
      console.error(formattedMessage, ...args);
      break;
    case 'WARN':
      console.warn(formattedMessage, ...args);
      break;
    default:
      console.log(formattedMessage, ...args);
  }
};

/**
 * Logger utility for consistent logging
 */
export const logger = {
  info: (context: string, message: string, ...args: LogArgs[]): void => {
    logMessage('INFO', context, message, ...args);
  },
  error: (context: string, message: string, ...args: LogArgs[]): void => {
    logMessage('ERROR', context, message, ...args);
  },
  debug: (context: string, message: string, ...args: LogArgs[]): void => {
    if (DEBUG) {
      logMessage('DEBUG', context, message, ...args);
    }
  },
  warn: (context: string, message: string, ...args: LogArgs[]): void => {
    logMessage('WARN', context, message, ...args);
  },
};

/**
 * Sleep for a specified number of milliseconds
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Validate completion arguments
 */
export const isValidCompletionArgs = (args: unknown): args is CompletionArgs => {
  if (typeof args !== 'object' || args === null) {
    return false;
  }

  const candidate = args as CompletionArgs;
  
  // Prompt is required
  if (typeof candidate.prompt !== 'string') {
    return false;
  }
  
  // Check optional numeric parameters
  const optionalNumericParams: (keyof CompletionArgs)[] = [
    'max_tokens',
    'temperature',
    'top_p',
    'frequency_penalty',
    'presence_penalty',
  ];
  
  for (const param of optionalNumericParams) {
    if (candidate[param] !== undefined && typeof candidate[param] !== 'number') {
      return false;
    }
  }
  
  return true;
}; 