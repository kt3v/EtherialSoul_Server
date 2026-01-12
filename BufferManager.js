/**
 * BufferManager - Handles buffer sending logic
 * Sends blocks one-by-one with typingTime delays
 */
export class BufferManager {
    constructor(sessionManager) {
        this.sessionManager = sessionManager;
        // Map of userId -> timeout ID for current block sending
        this.sendingTimeouts = new Map();
        // Map of userId -> socket for validation
        this.userSockets = new Map();
    }

    /**
     * Start sending buffer blocks for a user
     */
    async startSendingBuffer(userId, socket, onGroupComplete, onBufferComplete) {
        // Validate socket
        if (!socket || !socket.connected) {
            console.log(`   └─ ❌ Cannot start sending: socket not connected`);
            return;
        }

        // Store socket reference for validation
        this.userSockets.set(userId, socket);

        // Cancel any existing sending process
        this.stopSending(userId);

        // Reset buffer state
        this.sessionManager.resumeBuffer(userId);

        // Start sending blocks
        this._sendNextBlock(userId, socket, onGroupComplete, onBufferComplete);
    }

    /**
     * Send next block in the buffer
     */
    _sendNextBlock(userId, socket, onGroupComplete, onBufferComplete) {
        // Validate socket is still connected
        if (!socket || !socket.connected) {
            console.log(`   ├─ ⚠️  Socket disconnected for ${userId.substring(0, 8)}, stopping buffer send`);
            this.stopSending(userId);
            return;
        }

        // Check if paused
        if (this.sessionManager.isBufferPaused(userId)) {
            return;
        }

        // Check if UpdateCheck needs update and we should stop
        const updateCheckState = this.sessionManager.getUpdateCheckState(userId);
        if (updateCheckState.needsUpdate && !updateCheckState.waitingForGroup) {
            // UpdateCheck said YES and we're not waiting for group anymore - stop
            console.log('   ├─ 🛑 Stopping buffer send (UpdateCheck needs update, group complete)');
            this.sendingTimeouts.delete(userId);
            return;
        }

        // Get next block
        const block = this.sessionManager.getNextBlock(userId);

        if (!block) {
            // Buffer complete
            this.sendingTimeouts.delete(userId);

            if (onBufferComplete) {
                onBufferComplete(userId);
            }
            return;
        }

        const currentGroup = this.sessionManager.getCurrentGroup(userId);
        const blockIndex = this.sessionManager.getSession(userId).buffer.currentIndex;

        // Show block preview (first 40 chars)
        const preview = block.text.length > 40 ? block.text.substring(0, 40) + '...' : block.text;
        console.log(`📨 Block ${blockIndex + 1} [group ${currentGroup}]: "${preview}"`);

        // Send block to client
        socket.emit('ai_block', {
            text: block.text,
            group: block.group,
            timestamp: new Date().toISOString(),
        });

        // Add to AI message history
        this.sessionManager.addAIMessage(userId, block.text);

        // Advance to next block
        const previousGroup = currentGroup;
        this.sessionManager.advanceBlock(userId);
        const newGroup = this.sessionManager.getCurrentGroup(userId);

        // Check if group changed (group complete)
        if (previousGroup !== newGroup && onGroupComplete) {
            onGroupComplete(userId, previousGroup);
        }

        // Schedule next block
        const delay = Math.max(block.typingTime * 1000, 1000); // Convert to ms, minimum 1s

        const timeoutId = setTimeout(() => {
            this._sendNextBlock(userId, socket, onGroupComplete, onBufferComplete);
        }, delay);

        this.sendingTimeouts.set(userId, timeoutId);
    }

    /**
     * Stop sending buffer for user
     */
    stopSending(userId) {
        const timeoutId = this.sendingTimeouts.get(userId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.sendingTimeouts.delete(userId);
        }
    }

    /**
     * Pause sending (can be resumed)
     */
    pauseSending(userId) {
        this.stopSending(userId);
        this.sessionManager.pauseBuffer(userId);
    }

    /**
     * Resume sending
     */
    resumeSending(userId, socket, onGroupComplete, onBufferComplete) {
        if (!this.sessionManager.isBufferPaused(userId)) {
            return;
        }

        this.sessionManager.resumeBuffer(userId);
        this._sendNextBlock(userId, socket, onGroupComplete, onBufferComplete);
    }

    /**
     * Check if currently sending
     */
    isSending(userId) {
        return this.sendingTimeouts.has(userId);
    }

    /**
     * Clean up for user
     */
    cleanup(userId) {
        this.stopSending(userId);
        this.userSockets.delete(userId);
    }
}
