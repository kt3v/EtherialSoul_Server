import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { UserSessionManager } from './UserSessionManager.js';
import { BufferManager } from './BufferManager.js';
import { TimerManager } from './TimerManager.js';
import { GeminiService } from './GeminiService.js';
import { StateOrchestrator } from './StateOrchestrator.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
let geminiService = null;
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

        // Initialize Gemini service
        geminiService = new GeminiService(process.env.GEMINI_API_KEY);
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
    // Extract userId from handshake or generate one
    const userId = socket.handshake.query.userId || socket.id;

    if (!orchestrator) {
        socket.emit('error', {
            message: 'Server not ready. AI services not initialized.',
        });
        return;
    }

    // Handle incoming messages from client
    socket.on('user_message', async (data) => {
        try {
            const { message } = data;
            console.log(`\n💬 USER [${userId.substring(0, 8)}]: "${message}"`);

            // Echo user message back to confirm receipt
            socket.emit('message_received', {
                id: Date.now(),
                text: message,
                sender: 'user',
                timestamp: new Date().toISOString()
            });

            // Handle through orchestrator
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

            // Handle through orchestrator
            await orchestrator.handleTypingStatus(userId, isTyping, socket);

        } catch (error) {
            console.error('❌ Error handling typing status:', error.message);
        }
    });

    socket.on('disconnect', () => {
        console.log(`✗ Client disconnected: ${socket.id}`);

        // Clean up user state
        if (orchestrator) {
            orchestrator.cleanup(userId);
        }
    });
});

// Start server
async function startServer() {
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
