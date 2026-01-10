/**
 * UserSessionManager - Manages per-user session state
 * Handles message history, buffer state, typing status, and update flags
 */
export class UserSessionManager {
    constructor() {
        // Map of userId -> session data
        this.sessions = new Map();
    }

    /**
     * Get or create session for user
     */
    getSession(userId) {
        if (!this.sessions.has(userId)) {
            this.sessions.set(userId, {
                // Message history
                history: [],

                // Current buffer state
                buffer: {
                    blocks: [],           // Array of { text, typingTime, group }
                    currentIndex: 0,      // Current block being sent
                    currentGroup: null,   // Current group being sent
                    isComplete: false,    // All blocks sent
                    isPaused: false,      // Sending paused
                },

                // Typing state
                typing: {
                    isTyping: false,
                    lastTypingTime: null,
                    shouldUseIdleTimer: false, // Only true after UpdateCheck or EndUpdate scenarios
                },

                // Update check state
                updateCheck: {
                    needsUpdate: false,   // UpdateCheck returned YES
                    waitingForGroup: false, // Waiting for group to complete
                    lastCheckTime: null,
                },

                // EndUpdate state
                endUpdate: {
                    timerActive: false,
                    timerStartTime: null,
                    userMessagedSinceLastEndUpdate: false, // Track if user sent message since last EndUpdate
                },
            });
        }
        return this.sessions.get(userId);
    }

    /**
     * Add user message to history
     */
    addUserMessage(userId, message) {
        const session = this.getSession(userId);
        session.history.push({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString(),
        });
        return session.history;
    }

    /**
     * Add AI message to history
     */
    addAIMessage(userId, message) {
        const session = this.getSession(userId);
        session.history.push({
            role: 'model',
            content: message,
            timestamp: new Date().toISOString(),
        });
        return session.history;
    }

    /**
     * Get message history (optionally limited to last N messages)
     */
    getHistory(userId, limit = null) {
        const session = this.getSession(userId);
        if (limit) {
            return session.history.slice(-limit);
        }
        return session.history;
    }

    /**
     * Set new buffer for user
     */
    setBuffer(userId, blocks) {
        const session = this.getSession(userId);
        session.buffer = {
            blocks: blocks,
            currentIndex: 0,
            currentGroup: blocks.length > 0 ? blocks[0].group : null,
            isComplete: false,
            isPaused: false,
        };
        return session.buffer;
    }

    /**
     * Get next block to send
     */
    getNextBlock(userId) {
        const session = this.getSession(userId);
        const { buffer } = session;

        if (buffer.currentIndex >= buffer.blocks.length) {
            buffer.isComplete = true;
            return null;
        }

        return buffer.blocks[buffer.currentIndex];
    }

    /**
     * Advance to next block
     */
    advanceBlock(userId) {
        const session = this.getSession(userId);
        const { buffer } = session;

        buffer.currentIndex++;

        if (buffer.currentIndex < buffer.blocks.length) {
            buffer.currentGroup = buffer.blocks[buffer.currentIndex].group;
        } else {
            buffer.isComplete = true;
            buffer.currentGroup = null;
        }

        return buffer.currentIndex;
    }

    /**
     * Check if current group is complete
     */
    isCurrentGroupComplete(userId) {
        const session = this.getSession(userId);
        const { buffer } = session;

        if (buffer.isComplete) return true;
        if (buffer.currentIndex >= buffer.blocks.length) return true;

        const currentGroup = buffer.currentGroup;

        // Check if there are more blocks in the current group
        for (let i = buffer.currentIndex; i < buffer.blocks.length; i++) {
            if (buffer.blocks[i].group === currentGroup) {
                return false; // Still have blocks in this group
            }
        }

        return true; // No more blocks in current group
    }

    /**
     * Get current group number
     */
    getCurrentGroup(userId) {
        const session = this.getSession(userId);
        return session.buffer.currentGroup;
    }

    /**
     * Check if buffer is complete
     */
    isBufferComplete(userId) {
        const session = this.getSession(userId);
        return session.buffer.isComplete;
    }

    /**
     * Pause buffer sending
     */
    pauseBuffer(userId) {
        const session = this.getSession(userId);
        session.buffer.isPaused = true;
    }

    /**
     * Resume buffer sending
     */
    resumeBuffer(userId) {
        const session = this.getSession(userId);
        session.buffer.isPaused = false;
    }

    /**
     * Check if buffer is paused
     */
    isBufferPaused(userId) {
        const session = this.getSession(userId);
        return session.buffer.isPaused;
    }

    /**
     * Mark buffer as complete (force stop)
     */
    markBufferComplete(userId) {
        const session = this.getSession(userId);
        session.buffer.isComplete = true;
    }

    /**
     * Set typing state
     */
    setTypingState(userId, isTyping) {
        const session = this.getSession(userId);
        session.typing.isTyping = isTyping;
        session.typing.lastTypingTime = isTyping ? Date.now() : null;
    }

    /**
     * Get typing state
     */
    getTypingState(userId) {
        const session = this.getSession(userId);
        return session.typing;
    }

    /**
     * Enable idle timer for typing flow
     */
    enableIdleTimer(userId) {
        const session = this.getSession(userId);
        session.typing.shouldUseIdleTimer = true;
    }

    /**
     * Disable idle timer for typing flow
     */
    disableIdleTimer(userId) {
        const session = this.getSession(userId);
        session.typing.shouldUseIdleTimer = false;
    }

    /**
     * Set update check flag
     */
    setUpdateCheckNeeded(userId, needed) {
        const session = this.getSession(userId);
        session.updateCheck.needsUpdate = needed;
        session.updateCheck.lastCheckTime = Date.now();
    }

    /**
     * Get update check state
     */
    getUpdateCheckState(userId) {
        const session = this.getSession(userId);
        return session.updateCheck;
    }

    /**
     * Set waiting for group flag
     */
    setWaitingForGroup(userId, waiting) {
        const session = this.getSession(userId);
        session.updateCheck.waitingForGroup = waiting;
    }

    /**
     * Set EndUpdate timer state
     */
    setEndUpdateTimer(userId, active) {
        const session = this.getSession(userId);
        session.endUpdate.timerActive = active;
        session.endUpdate.timerStartTime = active ? Date.now() : null;
    }

    /**
     * Get EndUpdate state
     */
    getEndUpdateState(userId) {
        const session = this.getSession(userId);
        return session.endUpdate;
    }

    /**
     * Mark that user has sent a message (for EndUpdate tracking)
     */
    setUserMessagedSinceEndUpdate(userId, messaged) {
        const session = this.getSession(userId);
        session.endUpdate.userMessagedSinceLastEndUpdate = messaged;
    }

    /**
     * Check if user has sent a message since last EndUpdate
     */
    hasUserMessagedSinceEndUpdate(userId) {
        const session = this.getSession(userId);
        return session.endUpdate.userMessagedSinceLastEndUpdate;
    }

    /**
     * Clear session data for user
     */
    clearSession(userId) {
        this.sessions.delete(userId);
    }

    /**
     * Get all active user IDs
     */
    getActiveUsers() {
        return Array.from(this.sessions.keys());
    }
}
