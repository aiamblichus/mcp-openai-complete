FROM node:23-alpine

WORKDIR /app

# Copy package.json and lock files first for better caching
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install

# Copy the rest of the application code
COPY . .

# Build the TypeScript code
RUN pnpm run build

# Command to run the server
CMD ["node", "dist/cli.js"] 