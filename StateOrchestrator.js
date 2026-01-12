/**
 * StateOrchestrator - Coordinates the complex state machine
 * Handles UpdateCheck, UpdateBuffer, EndUpdate flows and timing logic
 */
export class StateOrchestrator {
    constructor(sessionManager, bufferManager, timerManager, geminiService) {
        this.sessionManager = sessionManager;
        this.bufferManager = bufferManager;
        this.timerManager = timerManager;
        this.geminiService = geminiService;

        // Map of userId -> socket
        this.userSockets = new Map();
    }

    /**
     * Register socket for user
     */
    registerSocket(userId, socket) {
        this.userSockets.set(userId, socket);
    }

    /**
     * Get socket for user
     */
    getSocket(userId) {
        const socket = this.userSockets.get(userId);
        console.log(`🔍 Looking for socket for ${userId}:`, socket ? 'found' : 'not found');
        console.log(`📋 Registered users:`, Array.from(this.userSockets.keys()));
        return socket;
    }

    /**
     * Handle incoming user message
     */
    async handleUserMessage(userId, message, socket) {
        // Register socket
        this.registerSocket(userId, socket);

        // Add message to history
        this.sessionManager.addUserMessage(userId, message);

        // Mark that user has sent a message (for EndUpdate tracking)
        this.sessionManager.setUserMessagedSinceEndUpdate(userId, true);

        // Cancel typing timers (user sent message)
        this.timerManager.cancelTypingTimers(userId);
        this.sessionManager.setTypingState(userId, false);

        // Disable idle timer flag (user sent message)
        this.sessionManager.disableIdleTimer(userId);

        // Cancel EndUpdate timer if active
        this.timerManager.cancelEndUpdateTimer(userId);
        this.sessionManager.setEndUpdateTimer(userId, false);

        // Check if buffer is currently being sent
        const isBufferComplete = this.sessionManager.isBufferComplete(userId);
        const isSending = this.bufferManager.isSending(userId);

        if (isSending && !isBufferComplete) {
            // Buffer is currently sending - trigger UpdateCheck flow
            console.log('   ├─ 🔄 Buffer is sending, triggering UpdateCheck...');
            await this.triggerUpdateCheck(userId);
        } else {
            // No buffer or buffer complete - directly trigger UpdateBuffer
            console.log('   ├─ 🆕 No active buffer, generating response...');
            await this.triggerUpdateBuffer(userId);
        }
    }

    async handleTypingStatus(userId, isTyping, socket) {
        // Register socket
        this.registerSocket(userId, socket);

        // Update typing state
        this.sessionManager.setTypingState(userId, isTyping);

        if (isTyping) {
            // User started typing
            // Cancel all typing-related timers (idle and max typing)
            this.timerManager.cancelTypingTimers(userId);

            // Cancel group delay timer (if running)
            this.timerManager.cancelGroupDelayTimer(userId);

            // Cancel EndUpdate timer if active
            const endUpdateState = this.sessionManager.getEndUpdateState(userId);
            if (endUpdateState.timerActive) {
                console.log('   ├─ 🛑 Cancelling EndUpdate timer (user started typing)');
                this.timerManager.cancelEndUpdateTimer(userId);
                this.sessionManager.setEndUpdateTimer(userId, false);
                // Enable idle timer for this typing session
                this.sessionManager.enableIdleTimer(userId);
            }

            // Start max typing timer (30 seconds)
            this.timerManager.startMaxTypingTimer(userId, async () => {
                console.log('   └─ ⏱️  Max typing time (30s) reached → generating update');
                // Reset user message flag - max typing timer is NOT a real user message
                this.sessionManager.setUserMessagedSinceEndUpdate(userId, false);
                await this.triggerUpdateBuffer(userId);
            });
        } else {
            // User stopped typing
            // Cancel max typing timer
            this.timerManager.cancelTypingTimers(userId);

            // Check if idle timer should be used
            const typingState = this.sessionManager.getTypingState(userId);

            if (typingState.shouldUseIdleTimer) {
                console.log('   ├─ ⏱️  User stopped typing, starting 5s idle timer...');
                this.timerManager.startTypingIdleTimer(userId, async () => {
                    console.log('   └─ ⏱️  Idle timer (5s) expired → generating update');
                    // Disable idle timer flag after triggering
                    this.sessionManager.disableIdleTimer(userId);
                    // Reset user message flag - idle timer is NOT a real user message
                    this.sessionManager.setUserMessagedSinceEndUpdate(userId, false);
                    await this.triggerUpdateBuffer(userId);
                });
            } else {
                console.log('   ├─ ⏭️  User stopped typing (no idle timer - waiting for message)');
            }
        }
    }

    /**
     * Trigger UpdateCheck flow
     */
    async triggerUpdateCheck(userId) {
        try {
            console.log('   ├─ 🔍 Running UpdateCheck...');

            // Get recent history (last 20 messages)
            const recentHistory = this.sessionManager.getHistory(userId, 20);

            // Get current buffer and index
            const session = this.sessionManager.getSession(userId);
            const currentBuffer = session.buffer.blocks;
            const currentIndex = session.buffer.currentIndex;

            // Call UpdateCheck with sent/pending distinction
            const needsUpdate = await this.geminiService.updateCheck(recentHistory, currentBuffer, currentIndex);

            if (needsUpdate) {
                console.log('   ├─ ✅ UpdateCheck: YES → update needed');
                this.sessionManager.setUpdateCheckNeeded(userId, true);

                // Wait for current group to complete
                const isGroupComplete = this.sessionManager.isCurrentGroupComplete(userId);

                if (isGroupComplete) {
                    console.log('   ├─ ✓ Group already complete, stopping buffer send');
                    // Immediately stop sending to prevent next group from being sent
                    this.bufferManager.stopSending(userId);
                    this._startGroupDelayFlow(userId);
                } else {
                    console.log('   ├─ ⏳ Waiting for current group to complete...');
                    this.sessionManager.setWaitingForGroup(userId, true);
                    // Will be triggered by onGroupComplete callback
                }
            } else {
                console.log('   ├─ ⏭️  UpdateCheck: NO → continuing current buffer');
                this.sessionManager.setUpdateCheckNeeded(userId, false);
            }
        } catch (error) {
            console.error('   ├─ ❌ UpdateCheck error:', error.message);
        }
    }

    /**
     * Start group delay flow (2 seconds after group complete)
     */
    _startGroupDelayFlow(userId) {
        console.log('   ├─ ⏱️  Starting 2s delay after group completion...');

        this.timerManager.startGroupDelayTimer(userId, async () => {
            const typingState = this.sessionManager.getTypingState(userId);

            if (typingState.isTyping) {
                console.log('   ├─ ⌨️  User is typing, waiting for them to stop...');
                // User is typing - enable idle timer flag so it starts when they stop typing
                this.sessionManager.enableIdleTimer(userId);
            } else {
                console.log('   ├─ ⏱️  User not typing, starting 5s idle timer...');
                this.timerManager.startTypingIdleTimer(userId, async () => {
                    console.log('   └─ ⏱️  Idle timer (5s) expired after group delay → generating update');
                    // Reset user message flag - group delay flow is NOT triggered by a real user message
                    this.sessionManager.setUserMessagedSinceEndUpdate(userId, false);
                    await this.triggerUpdateBuffer(userId);
                });
            }
        });
    }

    /**
     * Trigger UpdateBuffer - generate new buffer
     */
    async triggerUpdateBuffer(userId) {
        try {
            console.log('\n🤖 AI: Generating response...');

            // Cancel all timers
            this.timerManager.cancelAllTimers(userId);

            // Stop current buffer sending
            this.bufferManager.stopSending(userId);

            // Get full history
            const history = this.sessionManager.getHistory(userId);

            // Get pending (unsent) blocks from current buffer
            const session = this.sessionManager.getSession(userId);
            const currentIndex = session.buffer.currentIndex;
            const pendingBlocks = session.buffer.blocks.slice(currentIndex);

            // Call UpdateBuffer with only pending blocks
            const newBlocks = await this.geminiService.updateBuffer(history, pendingBlocks);

            console.log(`   ├─ ✅ Generated ${newBlocks.length} blocks`);

            // Set new buffer
            this.sessionManager.setBuffer(userId, newBlocks);

            // Reset update check state
            this.sessionManager.setUpdateCheckNeeded(userId, false);
            this.sessionManager.setWaitingForGroup(userId, false);

            // Start sending new buffer
            const socket = this.getSocket(userId);
            if (socket) {
                console.log('   └─ 📤 Starting to send blocks...\n');
                await this.bufferManager.startSendingBuffer(
                    userId,
                    socket,
                    // onGroupComplete callback
                    (userId, groupId) => this._handleGroupComplete(userId, groupId),
                    // onBufferComplete callback
                    (userId) => this._handleBufferComplete(userId)
                );
            } else {
                console.error('   └─ ❌ No socket found for user');
            }

        } catch (error) {
            console.error('\n❌ UpdateBuffer error:', error.message);

            // Send error to client
            const socket = this.getSocket(userId);
            if (socket) {
                socket.emit('error', {
                    message: 'Failed to generate response',
                    error: error.message
                });
            }
        }
    }

    /**
     * Handle group completion
     */
    _handleGroupComplete(userId, groupId) {
        console.log(`   ├─ ✓ Group ${groupId} complete`);

        // Check if we're waiting for group to complete for UpdateCheck
        const updateCheckState = this.sessionManager.getUpdateCheckState(userId);

        if (updateCheckState.needsUpdate && updateCheckState.waitingForGroup) {
            console.log('   ├─ 🔄 Was waiting for group, starting delay flow...');
            this.sessionManager.setWaitingForGroup(userId, false);
            // BufferManager will stop automatically on next block check
            this._startGroupDelayFlow(userId);
        }
    }

    /**
     * Handle buffer completion
     */
    _handleBufferComplete(userId) {
        console.log('\n✅ All blocks sent');

        // Notify client that AI has completed
        const socket = this.getSocket(userId);
        if (socket) {
            socket.emit('ai_complete');
        }

        // Check if UpdateCheck indicated update needed
        const updateCheckState = this.sessionManager.getUpdateCheckState(userId);

        if (updateCheckState.needsUpdate) {
            console.log('   ├─ 🔄 Update was needed, starting delay flow...');
            this._startGroupDelayFlow(userId);
        } else {
            // Only start EndUpdate timer if user has sent a message since last EndUpdate
            const hasUserMessaged = this.sessionManager.hasUserMessagedSinceEndUpdate(userId);

            if (hasUserMessaged) {
                console.log('   ├─ ⏱️  Starting EndUpdate timer (25s)...\n');
                this.sessionManager.setEndUpdateTimer(userId, true);

                this.timerManager.startEndUpdateTimer(userId, async () => {
                    console.log('   └─ ⏱️  EndUpdate timer expired → generating update');
                    // Reset the flag - user needs to send another message for next timer
                    this.sessionManager.setUserMessagedSinceEndUpdate(userId, false);
                    await this.triggerUpdateBuffer(userId);
                });
            } else {
                console.log('   └─ ⏭️  Skipping EndUpdate timer (no user messages since last EndUpdate)\n');
            }
        }
    }

    /**
     * Stop AI response (user requested)
     */
    stopAIResponse(userId, socket) {
        console.log('   ├─ 🛑 Stopping AI response...');

        // Cancel all timers
        this.timerManager.cancelAllTimers(userId);

        // Stop buffer sending
        this.bufferManager.stopSending(userId);

        // Mark buffer as complete to prevent further sending
        this.sessionManager.markBufferComplete(userId);

        // Notify client that AI has stopped
        if (socket) {
            socket.emit('ai_complete');
        }

        console.log('   └─ ✅ AI response stopped\n');
    }

    /**
     * Clean up for user (on disconnect)
     */
    cleanup(userId) {
        this.timerManager.cleanup(userId);
        this.bufferManager.cleanup(userId);
        this.sessionManager.clearSession(userId);
        this.userSockets.delete(userId);
    }
}
