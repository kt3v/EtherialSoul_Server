# EtherialSoul Server - Project Structure

## Overview
Node.js backend server with WebSocket support for real-time AI chat application.

## Directory Structure

```
EtherialSoul_Server/
├── src/
│   ├── config/                    # Configuration files
│   │   ├── prompt.txt             # Main AI system prompt
│   │   └── evaluator_prompt.txt  # UpdateCheck evaluator prompt
│   │
│   ├── managers/                  # State and session management
│   │   ├── BufferManager.js       # Handles AI response block streaming
│   │   ├── StateOrchestrator.js   # Coordinates state machine flows
│   │   ├── TimerManager.js        # Manages all timers
│   │   └── UserSessionManager.js  # Per-user session state
│   │
│   ├── middleware/                # Express/Socket.IO middleware
│   │   └── authMiddleware.js      # Supabase JWT authentication
│   │
│   ├── services/                  # External service integrations
│   │   └── GeminiService.js       # Google Gemini AI integration
│   │
│   └── index.js                   # Application entry point
│
├── logs/                          # Runtime logs
├── .env                           # Environment variables
├── package.json                   # Dependencies and scripts
└── README.md                      # Project documentation
```

## Module Responsibilities

### Entry Point
- **src/index.js** - Express server, Socket.IO, WebSocket handlers

### Managers
- **BufferManager** - AI response block streaming with timing
- **StateOrchestrator** - Coordinates UpdateCheck, UpdateBuffer, EndUpdate
- **TimerManager** - Centralized timer management
- **UserSessionManager** - Per-user session state

### Services
- **GeminiService** - Google Gemini API integration

### Middleware
- **authMiddleware** - Supabase JWT validation

## Import Patterns

```javascript
import { UserSessionManager } from './managers/UserSessionManager.js';
import { BufferManager } from './managers/BufferManager.js';
import { GeminiService } from './services/GeminiService.js';
import { socketAuthMiddleware } from './middleware/authMiddleware.js';
```

## NPM Scripts

```bash
npm start       # Production mode
npm run dev     # Development with auto-reload
```
