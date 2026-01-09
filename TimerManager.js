/**
 * TimerManager - Manages all timing logic for the application
 * Handles typing timers, group delays, and EndUpdate timers
 */
export class TimerManager {
    constructor() {
        // Map of userId -> { timerType -> timeoutId }
        this.timers = new Map();
    }

    /**
     * Get or create timer map for user
     */
    _getUserTimers(userId) {
        if (!this.timers.has(userId)) {
            this.timers.set(userId, {});
        }
        return this.timers.get(userId);
    }

    /**
     * Clear specific timer
     */
    _clearTimer(userId, timerType) {
        const userTimers = this._getUserTimers(userId);
        if (userTimers[timerType]) {
            clearTimeout(userTimers[timerType]);
            delete userTimers[timerType];
        }
    }

    /**
     * Set timer
     */
    _setTimer(userId, timerType, callback, delay) {
        // Clear existing timer of this type
        this._clearTimer(userId, timerType);

        const userTimers = this._getUserTimers(userId);
        const timeoutId = setTimeout(() => {
            delete userTimers[timerType];
            callback();
        }, delay);

        userTimers[timerType] = timeoutId;
    }

    /**
     * Start 5-second idle timer after user stops typing
     */
    startTypingIdleTimer(userId, callback) {
        this._setTimer(userId, 'typingIdle', callback, 5000);
    }

    /**
     * Start 30-second max typing timer
     */
    startMaxTypingTimer(userId, callback) {
        this._setTimer(userId, 'maxTyping', callback, 30000);
    }

    /**
     * Start 2-second delay after group completion
     */
    startGroupDelayTimer(userId, callback) {
        this._setTimer(userId, 'groupDelay', callback, 2000);
    }

    /**
     * Start 25-second EndUpdate timer
     */
    startEndUpdateTimer(userId, callback) {
        this._setTimer(userId, 'endUpdate', callback, 25000);
    }

    /**
     * Cancel all timers for user
     */
    cancelAllTimers(userId) {
        const userTimers = this._getUserTimers(userId);
        const timerTypes = Object.keys(userTimers);

        timerTypes.forEach(timerType => {
            this._clearTimer(userId, timerType);
        });
    }

    /**
     * Cancel only typing-related timers
     */
    cancelTypingTimers(userId) {
        this._clearTimer(userId, 'typingIdle');
        this._clearTimer(userId, 'maxTyping');
    }

    /**
     * Cancel EndUpdate timer
     */
    cancelEndUpdateTimer(userId) {
        this._clearTimer(userId, 'endUpdate');
    }

    /**
     * Cancel group delay timer
     */
    cancelGroupDelayTimer(userId) {
        this._clearTimer(userId, 'groupDelay');
    }

    /**
     * Check if timer is active
     */
    isTimerActive(userId, timerType) {
        const userTimers = this._getUserTimers(userId);
        return !!userTimers[timerType];
    }

    /**
     * Clean up all timers for user
     */
    cleanup(userId) {
        this.cancelAllTimers(userId);
        this.timers.delete(userId);
    }
}
