#!/usr/bin/env node

import { startServer } from './index'; // Adjust this import based on your actual code structure

// Print some basic info
console.error('Starting MCP OpenAI Complete Server...');
console.error('Use Ctrl+C to stop the server');

// Start the server
startServer();