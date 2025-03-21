# OpenAI Complete MCP Server

An MCP (Model Context Protocol) server that provides a clean interface for LLMs to use text completion capabilities through the MCP protocol. This server acts as a bridge between an LLM client and any OpenAI's compatible API. The primary use case is for **base models**, as the server does not provide support for chat completions.

## Features

- Provides a single tool named "complete" for generating text completions
- Properly handles asynchronous processing to avoid blocking
- Implements timeout handling with graceful fallbacks
- Supports cancellation of ongoing requests

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd mcp-openai-complete

# Install dependencies
pnpm install

# Build the project
pnpm run build
```

## Configuration

The following environment variables are required:

```
OPENAI_API_KEY=your-hyperbolic-api-key
OPENAI_API_BASE=https://api.hyperbolic.xyz/v1
OPENAI_MODEL=meta-llama/Meta-Llama-3.1-405B
```

## Usage

Start the server:

```bash
pnpm start
```

This will start the server on stdio, making it available for MCP clients to communicate with.

## Docker Usage

### Building the Docker Image

```bash
docker build -t mcp-openai-complete .
```

### Running the Container

```bash
# Run with environment variables
docker run -it --rm \
  -e OPENAI_API_KEY="your-api-key" \
  -e OPENAI_MODEL="gpt-3.5-turbo-instruct" \
  mcp-openai-complete
```

You can also use a .env file:

```bash
# Run with .env file
docker run -it --rm \
  --env-file .env \
  mcp-openai-complete
```

### Parameters for the "complete" tool

- `prompt` (string, required): The text prompt to complete
- `max_tokens` (integer, optional): Maximum tokens to generate, default: 150
- `temperature` (number, optional): Controls randomness (0-1), default: 0.7
- `top_p` (number, optional): Controls diversity via nucleus sampling, default: 1.0
- `frequency_penalty` (number, optional): Decreases repetition of token sequences, default: 0.0
- `presence_penalty` (number, optional): Increases likelihood of talking about new topics, default: 0.0

## Development

For development with auto-reloading:

```bash
npm run dev
```

## License

MIT 