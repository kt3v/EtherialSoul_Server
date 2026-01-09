# EtherialSoul Server

Backend server for AI Chat application with WebSocket support.

## Features

- ✅ Express REST API
- ✅ Socket.io WebSocket server for real-time communication
- ✅ Gemini AI integration (simple proxy)
- ✅ CORS enabled for cross-origin requests

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Add your Gemini API key to `.env`:
```
GEMINI_API_KEY=your_actual_api_key_here
```

4. Start the server:
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## API Endpoints

### REST API

- `GET /health` - Health check endpoint

### WebSocket Events

**Client → Server:**
- `user_message` - Send a message to AI
  ```json
  {
    "message": "Hello AI",
    "userId": "user123"
  }
  ```
- `typing_status` - Update typing status
  ```json
  {
    "userId": "user123",
    "isTyping": true
  }
  ```

**Server → Client:**
- `message_received` - Confirmation of message receipt
- `ai_message` - AI response
- `user_typing` - Another user is typing
- `error` - Error occurred

## Environment Variables

- `PORT` - Server port (default: 3000)
- `GEMINI_API_KEY` - Your Gemini API key

## Phase 1 Scope

This is a simple proxy server without advanced logic:
- ✅ Receives messages from clients
- ✅ Forwards to Gemini API
- ✅ Returns responses to clients
- ❌ No message history storage (Phase 2)
- ❌ No UpdateBuffer logic (Phase 2)
- ❌ No UpdateCheck logic (Phase 2)
