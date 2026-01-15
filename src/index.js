import dotenv from 'dotenv';
dotenv.config();

// Diagnostic logging
console.log('🔧 Environment check:');
console.log(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? 'SET' : 'NOT SET'}`);
console.log(`   SUPABASE_JWT_SECRET: ${process.env.SUPABASE_JWT_SECRET ? 'SET (length: ' + process.env.SUPABASE_JWT_SECRET.length + ')' : 'NOT SET'}`);
console.log(`   SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET'}`);

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { UserSessionManager } from './managers/UserSessionManager.js';
import { BufferManager } from './managers/BufferManager.js';
import { TimerManager } from './managers/TimerManager.js';
import { GeminiService } from './services/GeminiService.js';
import { UserProfileService } from './services/UserProfileService.js';
import { StateOrchestrator } from './managers/StateOrchestrator.js';
import { socketAuthMiddleware } from './middleware/authMiddleware.js';
import { clearTxtLogs } from './utils/logsCleanup.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

io.use(socketAuthMiddleware);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
let geminiService = null;
let userProfileService = null;
let sessionManager = null;
let bufferManager = null;
let timerManager = null;
let orchestrator = null;

async function initializeServices() {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.warn('⚠️  GEMINI_API_KEY not found. AI features will be disabled.');
            return false;
        }

        // Initialize User Profile service
        userProfileService = new UserProfileService();

        // Initialize Gemini service with user profile service
        geminiService = new GeminiService(process.env.GEMINI_API_KEY, userProfileService);
        await geminiService.loadPrompts();

        // Initialize managers
        sessionManager = new UserSessionManager();
        bufferManager = new BufferManager(sessionManager);
        timerManager = new TimerManager();

        // Initialize orchestrator
        orchestrator = new StateOrchestrator(
            sessionManager,
            bufferManager,
            timerManager,
            geminiService
        );

        console.log('✅ Server initialized\n');
        return true;
    } catch (error) {
        console.error('❌ Error initializing services:', error);
        return false;
    }
}

// REST API Routes
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        aiEnabled: !!geminiService,
        activeUsers: sessionManager ? sessionManager.getActiveUsers().length : 0
    });
});

// WebSocket connection handling
io.on('connection', (socket) => {
    // Use socket.id as the unique identifier for this connection
    const userId = socket.id;
    
    console.log(`\n🔌 Client connected: ${socket.id}`);
    if (socket.authenticated && socket.user) {
        console.log(`   ✅ Authenticated as: ${socket.user.email}`);
        console.log(`   🆔 User DB ID: ${socket.user.id}`);
        console.log(`   📊 Profile will be loaded for AI context`);
    } else {
        console.log(`   ⚠️  Anonymous user (no auth token)`);
        console.log(`   ℹ️  AI will respond without user profile data`);
    }

    if (!orchestrator) {
        socket.emit('error', {
            message: 'Server not ready. AI services not initialized.',
        });
        return;
    }

    // Register socket with orchestrator immediately
    orchestrator.registerSocket(userId, socket);

    // Handle chat mode selection
    socket.on('set_chat_mode', (data) => {
        try {
            const { mode, initialMessage } = data;
            console.log(`\n🎯 Chat mode selected: ${mode}`);
            
            // Set the chat mode in GeminiService
            if (geminiService) {
                geminiService.setChatMode(mode);
            }
            
            // If there's an initial message, process it immediately
            if (initialMessage) {
                console.log(`   ├─ 📨 Initial message: "${initialMessage}"`);
                socket.emit('message_received', {
                    id: Date.now(),
                    text: initialMessage,
                    sender: 'user',
                    timestamp: new Date().toISOString()
                });
                
                // Process the initial message
                orchestrator.handleUserMessage(userId, initialMessage, socket).catch(error => {
                    console.error('❌ Error processing initial message:', error.message);
                });
            }
        } catch (error) {
            console.error('❌ Error setting chat mode:', error.message);
        }
    });

    // Handle incoming messages from client
    socket.on('user_message', async (data) => {
        try {
            const { message, chatMode } = data;
            
            // Update chat mode if provided
            if (chatMode && geminiService) {
                geminiService.setChatMode(chatMode);
            }
            const userInfo = socket.user ? `${socket.user.email} (${socket.user.id.substring(0, 8)})` : 'Anonymous';
            console.log(`\n💬 USER [${userInfo}]: "${message}"`);

            // Echo user message back to confirm receipt
            socket.emit('message_received', {
                id: Date.now(),
                text: message,
                sender: 'user',
                timestamp: new Date().toISOString()
            });

            // Handle through orchestrator (use socket.id as userId)
            await orchestrator.handleUserMessage(userId, message, socket);

        } catch (error) {
            console.error('❌ Error processing message:', error.message);
            socket.emit('error', {
                message: 'Failed to process message',
                error: error.message
            });
        }
    });

    // Handle typing status
    socket.on('typing_status', async (data) => {
        try {
            const { isTyping } = data;
            const status = isTyping ? '⌨️  typing...' : '⏸️  stopped typing';
            console.log(`${status} [${userId.substring(0, 8)}]`);

            // Handle through orchestrator (use socket.id as userId)
            await orchestrator.handleTypingStatus(userId, isTyping, socket);

        } catch (error) {
            console.error('❌ Error handling typing status:', error.message);
        }
    });

    // Handle stop AI response request
    socket.on('stop_ai_response', async (data) => {
        try {
            console.log(`\n🛑 STOP REQUEST [${userId.substring(0, 8)}]`);

            // Handle through orchestrator (use socket.id as userId)
            orchestrator.stopAIResponse(userId, socket);

        } catch (error) {
            console.error('❌ Error stopping AI response:', error.message);
        }
    });

    // Handle end chat request
    socket.on('end_chat', async (data) => {
        try {
            console.log(`\n🔚 END CHAT REQUEST [${userId.substring(0, 8)}]`);

            // Stop any ongoing AI response
            orchestrator.stopAIResponse(userId, socket);

            // Clean up all session state
            orchestrator.cleanup(userId);

            console.log(`   ✅ Chat session ended and cleaned up`);

        } catch (error) {
            console.error('❌ Error ending chat:', error.message);
        }
    });

    socket.on('disconnect', () => {
        console.log(`\n✗ Client disconnected: ${socket.id}`);
        console.log(`   🧹 Cleaning up session for user: ${userId.substring(0, 8)}`);

        // Clean up all user state
        if (orchestrator) {
            orchestrator.cleanup(userId);
        }
        
        console.log(`   ✅ Cleanup complete\n`);
    });

    // Handle error events
    socket.on('error', (error) => {
        console.error(`❌ Socket error for ${userId.substring(0, 8)}:`, error.message);
    });
});

// Start server
async function startServer() {
    try {
        const { deleted } = await clearTxtLogs();
        if (deleted > 0) console.log(`🧹 Cleared ${deleted} .txt file(s) from logs/`);
    } catch (error) {
        console.warn('⚠️  Failed to clear logs folder:', error?.message || error);
    }

    const servicesReady = await initializeServices();

    httpServer.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📡 WebSocket server ready`);

        if (!servicesReady) {
            console.warn('⚠ Server started but AI services are not available');
        }
    });
}

startServer();
