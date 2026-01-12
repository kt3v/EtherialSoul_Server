import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';

/**
 * GeminiService - Handles all Gemini AI interactions
 * Manages UpdateBuffer and UpdateCheck functions
 */
export class GeminiService {
    constructor(apiKey) {
        this.genAI = new GoogleGenerativeAI(apiKey);

        // Initialize models
        this.mainModel = this.genAI.getGenerativeModel({
            model: process.env.MAIN_MODEL || 'gemini-2.0-flash-exp',
            generationConfig: {
                temperature: 0.9,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 8192,
            },
        });

        this.evaluatorModel = this.genAI.getGenerativeModel({
            model: process.env.EVALUATOR_MODEL || 'gemini-2.0-flash-thinking-exp-01-21',
            generationConfig: {
                temperature: 0.3,
                topP: 0.95,
                topK: 20,
                maxOutputTokens: 1024,
            },
        });

        this.mainPrompt = null;
        this.evaluatorPrompt = null;
    }

    /**
     * Load prompts from files
     */
    async loadPrompts() {
        try {
            // Load main prompt
            const promptPath = path.join(process.cwd(), 'src', 'config', 'prompt.txt');
            this.mainPrompt = await fs.readFile(promptPath, 'utf-8');

            // Load evaluator prompt
            const evaluatorPath = path.join(process.cwd(), 'src', 'config', 'evaluator_prompt.txt');
            this.evaluatorPrompt = await fs.readFile(evaluatorPath, 'utf-8');

            return true;
        } catch (error) {
            console.error('❌ Error loading prompts:', error);
            throw error;
        }
    }

    /**
     * Convert message history to Gemini format
     */
    _formatHistory(history) {
        return history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
        }));
    }

    /**
     * Save context to file for debugging
     */
    async _saveContextToFile(fullPrompt, history, previousBuffer) {
        try {
            const projectRoot = process.cwd();
            const logsDir = path.join(projectRoot, 'logs');

            // Create logs directory if it doesn't exist
            await fs.mkdir(logsDir, { recursive: true });

            // Create timestamp for filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `update_buffer_${timestamp}.txt`;
            const filepath = path.join(logsDir, filename);

            // Build content to save
            let content = '='.repeat(80) + '\n';
            content += 'UPDATE BUFFER CONTEXT LOG\n';
            content += `Timestamp: ${new Date().toISOString()}\n`;
            content += '='.repeat(80) + '\n\n';

            content += '📝 FULL PROMPT SENT TO GEMINI:\n';
            content += '-'.repeat(80) + '\n';
            content += fullPrompt + '\n\n';

            content += '='.repeat(80) + '\n';
            content += 'END OF LOG\n';
            content += '='.repeat(80) + '\n';

            // Write to file
            await fs.writeFile(filepath, content, 'utf-8');
            console.log(`   ├─ 💾 Context saved to: logs/${filename}`);

        } catch (error) {
            console.error('   ├─ ⚠️  Failed to save context to file:', error.message);
            // Don't throw - logging failure shouldn't break the main flow
        }
    }

    /**
     * UpdateBuffer - Generate new buffer from conversation history
     */
    async updateBuffer(history, previousBuffer = null) {
        try {
            // Build the full prompt with system instruction and history
            let fullPrompt = this.mainPrompt + '\n\n';

            // Add conversation history
            if (history && history.length > 0) {
                fullPrompt += '=== CONVERSATION HISTORY ===\n\n';
                history.forEach(msg => {
                    const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
                    fullPrompt += `${role}: ${msg.content}\n\n`;
                });
            }

            // Add pending buffer if exists (blocks that haven't been sent yet)
            if (previousBuffer && previousBuffer.length > 0) {
                fullPrompt += '=== PENDING BUFFER ===\n\n';
                previousBuffer.forEach((block, index) => {
                    fullPrompt += `Block ${index + 1} (Group ${block.group}): ${block.text}\n`;
                });
                fullPrompt += '\n';
            }

            // Save context to file for debugging
            await this._saveContextToFile(fullPrompt, history, previousBuffer);

            // Generate response
            const result = await this.mainModel.generateContent(fullPrompt);
            const response = await result.response;
            const text = response.text();

            // Parse JSON response
            let parsedResponse;
            try {
                // Try to extract JSON from markdown code blocks if present
                const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
                const jsonText = jsonMatch ? jsonMatch[1] : text;
                parsedResponse = JSON.parse(jsonText.trim());
            } catch (parseError) {
                console.error('   ├─ ❌ JSON parse error:', parseError.message);
                throw new Error('Failed to parse JSON response from Gemini');
            }

            // Validate response structure
            if (!parsedResponse.blocks || !Array.isArray(parsedResponse.blocks)) {
                throw new Error('Invalid response structure: missing blocks array');
            }

            // Validate each block
            parsedResponse.blocks.forEach((block, index) => {
                if (!block.text || typeof block.text !== 'string') {
                    throw new Error(`Block ${index}: missing or invalid text`);
                }
                if (typeof block.typingTime !== 'number') {
                    throw new Error(`Block ${index}: missing or invalid typingTime`);
                }
                if (typeof block.group !== 'number') {
                    throw new Error(`Block ${index}: missing or invalid group`);
                }
            });

            return parsedResponse.blocks;

        } catch (error) {
            console.error('   ├─ ❌ UpdateBuffer error:', error.message);
            throw error;
        }
    }

    /**
     * UpdateCheck - Check if buffer needs updating based on recent messages
     */
    async updateCheck(recentHistory, currentBuffer, currentIndex = 0) {
        try {
            // Split buffer into sent and pending blocks
            const sentBlocks = currentBuffer && currentBuffer.length > 0
                ? currentBuffer.slice(0, currentIndex)
                : [];

            const pendingBlocks = currentBuffer && currentBuffer.length > 0
                ? currentBuffer.slice(currentIndex)
                : [];

            // Format sent blocks
            const sentText = sentBlocks.length > 0
                ? sentBlocks.map(b => b.text).join('\n')
                : 'None';

            // Format pending blocks
            const pendingText = pendingBlocks.length > 0
                ? pendingBlocks.map(b => b.text).join('\n')
                : 'None';

            // Format recent user messages
            const userMessages = recentHistory
                .filter(msg => msg.role === 'user')
                .map(msg => msg.content)
                .join('\n');

            // Create prompt with three sections
            const checkPrompt = `${this.evaluatorPrompt}

SENT BLOCKS:
${sentText}

PENDING BLOCKS:
${pendingText}

USER MESSAGES:
${userMessages}`;

            // Generate response
            const result = await this.evaluatorModel.generateContent(checkPrompt);
            const response = await result.response;
            const text = response.text().trim().toUpperCase();

            // Parse YES/NO
            const needsUpdate = text.includes('YES');

            return needsUpdate;

        } catch (error) {
            console.error('   ├─ ❌ UpdateCheck error:', error.message);
            // Default to NO on error to avoid infinite loops
            return false;
        }
    }
}
