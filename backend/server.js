import 'dotenv/config';
import http from 'http';
import { createApp } from './createApp.js';
import Connection from './database/db.js';
import { findConfigProblems } from './config/env.js';
import { resolveAssistantMode } from './services/assistant/provider.js';

// NODE_ENV=test is reserved for the offline checks, which build the app without
// this file. A real server never runs with it, so test-only hooks stay unusable.
if (process.env.NODE_ENV === 'test') {
  console.error('Server not started: NODE_ENV=test is reserved for offline checks.');
  process.exit(1);
}

// Refuse to start with missing or unsafe configuration. Only variable names are
// reported, never their values.
const configProblems = findConfigProblems();
if (configProblems.length > 0) {
  console.error(`Server not started. Missing or invalid configuration: ${configProblems.join('; ')}. See env.sample.txt.`);
  process.exit(1);
}

// AI Support mode. Only mode names and a reason code are printed, never a key.
const assistantMode = resolveAssistantMode();
if (assistantMode.requested !== assistantMode.effective) {
  console.warn(`AI Support is running in ${assistantMode.effective} mode (ASSISTANT_MODE=${assistantMode.requested}; reason: ${assistantMode.reason}).`);
}

const app = createApp();
const server = http.createServer(app);

const PORT = process.env.PORT || 8000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server is running on port ${PORT}`);
});

// Connect to MongoDB
Connection();
