#!/usr/bin/env node
import OpenAI from 'openai';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOP_P,
  DEFAULT_FREQUENCY_PENALTY,
  DEFAULT_PRESENCE_PENALTY,
  COMPLETION_TIMEOUT_MS,
  PROGRESS_UPDATE_INTERVAL_MS,
  SERVER_NAME,
  SERVER_VERSION,
} from './constants.js';
import {
  CompletionArgs,
  CompletionResponse,
  CompletionTask,
  CompletionStatusEnum,
  CompletionTimeoutError,
  CompletionCancelledError,
} from './types.js';
import { logger, sleep, isValidCompletionArgs } from './utils.js';

// Load environment variables
dotenv.config();

/**
 * OpenAI Completion MCP Server
 * 
 * This server provides a clean interface for LLMs to use OpenAI's completion APIs
 * through the MCP protocol, acting as a bridge between an LLM client and OpenAI's API.
 */
class OpenAICompleteMcpServer {
  private server: Server;
  private openai: OpenAI;
  private model: string;
  private activeTasks: Map<string, CompletionTask> = new Map();

  constructor(apiKey: string, apiBaseUrl?: string, model: string = DEFAULT_MODEL) {
    logger.debug('Server', 'Initializing OpenAI Complete MCP Server');

    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: apiKey,
      baseURL: apiBaseUrl,
    });
    
    this.model = model;

    // Initialize MCP server
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    // Error handling
    this.server.onerror = (error): void => {
      logger.error('Server', `MCP Error: ${error instanceof Error ? error.stack : String(error)}`);
      throw error;
    };

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Shutdown', 'Starting server shutdown');
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, () =>
      Promise.resolve({
        tools: [
          {
            name: 'complete',
            description: 'Generate text completions using OpenAI models',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: {
                  type: 'string',
                  description: 'The text prompt to complete',
                },
                max_tokens: {
                  type: 'integer',
                  description: 'Maximum tokens to generate',
                  default: DEFAULT_MAX_TOKENS,
                },
                temperature: {
                  type: 'number',
                  description: 'Controls randomness (0-1)',
                  default: DEFAULT_TEMPERATURE,
                },
                top_p: {
                  type: 'number',
                  description: 'Controls diversity via nucleus sampling',
                  default: DEFAULT_TOP_P,
                },
                frequency_penalty: {
                  type: 'number',
                  description: 'Decreases repetition of token sequences',
                  default: DEFAULT_FREQUENCY_PENALTY,
                },
                presence_penalty: {
                  type: 'number',
                  description: 'Increases likelihood of talking about new topics',
                  default: DEFAULT_PRESENCE_PENALTY,
                },
              },
              required: ['prompt'],
            },
          },
        ],
      })
    );

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'complete') {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
      }
      
      return await this.handleCompleteTool(request.params.arguments || {});
    });
  }

  private async handleCompleteTool(
    args: Record<string, unknown>
  ): Promise<{ content: { type: string; text: string }[] }> {
    if (!isValidCompletionArgs(args)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid completion arguments');
    }

    try {
      // Generate a task ID
      const taskId = uuidv4();
      
      // Start completion task
      const result = await this.complete(taskId, args);
      
      // Return completion result
      return {
        content: [
          {
            type: 'text',
            text: result.text,
          },
        ],
      };
    } catch (error) {
      // Handle specific errors
      if (error instanceof CompletionTimeoutError) {
        return {
          content: [
            {
              type: 'text',
              text: 'The completion request timed out. Please try again with a shorter prompt or fewer tokens.',
            },
          ],
        };
      } else if (error instanceof CompletionCancelledError) {
        return {
          content: [
            {
              type: 'text',
              text: 'The request was cancelled.',
            },
          ],
        };
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  private async complete(
    taskId: string,
    args: CompletionArgs
  ): Promise<CompletionResponse> {
    const {
      prompt,
      max_tokens = DEFAULT_MAX_TOKENS,
      temperature = DEFAULT_TEMPERATURE,
      top_p = DEFAULT_TOP_P,
      frequency_penalty = DEFAULT_FREQUENCY_PENALTY,
      presence_penalty = DEFAULT_PRESENCE_PENALTY,
    } = args;
    
    // Create abort controller for cancellation
    const abortController = new AbortController();
    
    // Initialize task
    const task: CompletionTask = {
      status: CompletionStatusEnum.Pending,
      created_at: Date.now(),
      timeout_at: Date.now() + COMPLETION_TIMEOUT_MS,
      progress: 0,
      abortController,
    };
    
    this.activeTasks.set(taskId, task);
    
    try {
      // Update task status
      task.status = CompletionStatusEnum.Processing;
      this.activeTasks.set(taskId, task);
      
      // Start API call with timeout
      logger.debug('Completion', `Starting completion request for task ${taskId}`);
      
      const response = await Promise.race([
        this.makeApiCall(prompt, max_tokens, temperature, top_p, frequency_penalty, presence_penalty, abortController.signal),
        this.createTimeoutPromise(taskId),
      ]);
      
      // Process response
      const completionResult: CompletionResponse = {
        text: response.choices[0].text || '',
        model: this.model,
        finish_reason: response.choices[0].finish_reason || undefined,
      };
      
      // Add usage info if available
      if (response.usage) {
        completionResult.usage = {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        };
      }
      
      // Update task with result
      const updatedTask = this.activeTasks.get(taskId);
      if (updatedTask) {
        updatedTask.status = CompletionStatusEnum.Complete;
        updatedTask.result = completionResult;
        updatedTask.progress = 100;
        this.activeTasks.set(taskId, updatedTask);
      }
      
      logger.debug('Completion', `Task ${taskId} completed successfully`);
      
      return completionResult;
    } catch (error) {
      const updatedTask = this.activeTasks.get(taskId);
      
      if (updatedTask) {
        updatedTask.status = CompletionStatusEnum.Error;
        updatedTask.error = error instanceof Error ? error.message : 'Unknown error';
        this.activeTasks.set(taskId, updatedTask);
      }
      
      if (error instanceof CompletionTimeoutError || error instanceof CompletionCancelledError) {
        throw error;
      }
      
      if (abortController.signal.aborted) {
        throw new CompletionCancelledError();
      }
      
      throw new McpError(
        ErrorCode.InvalidRequest,
        `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      // Keep task in map for a while for status checks, but eventually clean up
      setTimeout(() => {
        this.activeTasks.delete(taskId);
      }, COMPLETION_TIMEOUT_MS);
    }
  }
  
  private async makeApiCall(
    prompt: string,
    max_tokens: number,
    temperature: number,
    top_p: number,
    frequency_penalty: number,
    presence_penalty: number,
    signal: AbortSignal
  ) {
    return this.openai.completions.create(
      {
        model: this.model,
        prompt,
        max_tokens,
        temperature,
        top_p,
        frequency_penalty,
        presence_penalty,
      },
      { signal }
    );
  }
  
  private createTimeoutPromise(taskId: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        const task = this.activeTasks.get(taskId);
        if (task) {
          task.status = CompletionStatusEnum.Error;
          task.error = 'Completion timed out';
          this.activeTasks.set(taskId, task);
        }
        reject(new CompletionTimeoutError());
      }, COMPLETION_TIMEOUT_MS);
    });
  }
  
  public cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (task && task.status !== CompletionStatusEnum.Complete && task.status !== CompletionStatusEnum.Error) {
      // Abort the request
      task.abortController.abort();
      
      // Update task status
      task.status = CompletionStatusEnum.Error;
      task.error = 'Task cancelled by user';
      this.activeTasks.set(taskId, task);
      
      logger.info('Completion', `Task ${taskId} cancelled`);
      return true;
    }
    return false;
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Server', 'OpenAI Complete MCP server running on stdio');
  }
}

// Get configuration from environment variables
const apiKey = process.env.OPENAI_API_KEY;
const apiBaseUrl = process.env.OPENAI_API_BASE;
const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

if (!apiKey) {
  logger.error('Config', 'OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

// Start server
const server = new OpenAICompleteMcpServer(apiKey, apiBaseUrl, model);
void server.run().catch((error) => {
  logger.error('Startup', `Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}); 