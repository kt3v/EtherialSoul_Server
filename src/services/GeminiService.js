import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';

/**
 * GeminiService - Handles all Gemini AI interactions
 * Manages UpdateBuffer and UpdateCheck functions
 */
export class GeminiService {
    constructor(apiKey, userProfileService = null) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.userProfileService = userProfileService;

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

        this.baseFormattingRules = null;
        this.tarotExpertPrompt = null;
        this.astroExpertPrompt = null;
        this.evaluatorPrompt = null;
        this.dailyForecastPrompt = null;
        this.currentPrompt = null;
        this.questionType = null;
        this.clientChartData = {
            natal: null,
            transit: null
        };
    }

    /**
     * Load prompts from files
     */
    async loadPrompts() {
        try {
            // Load base formatting rules (universal for all prompts)
            const baseRulesPath = path.join(process.cwd(), 'src', 'config', 'base_formatting_rules.txt');
            this.baseFormattingRules = await fs.readFile(baseRulesPath, 'utf-8');

            // Load Tarot Expert prompt
            const tarotPath = path.join(process.cwd(), 'src', 'config', 'tarot_expert.txt');
            const tarotContext = await fs.readFile(tarotPath, 'utf-8');
            this.tarotExpertPrompt = this.baseFormattingRules + '\n\n' + tarotContext;

            // Load Astrology Expert prompt
            const astroPath = path.join(process.cwd(), 'src', 'config', 'astro_expert.txt');
            const astroContext = await fs.readFile(astroPath, 'utf-8');
            this.astroExpertPrompt = this.baseFormattingRules + '\n\n' + astroContext;

            // Load evaluator prompt
            const evaluatorPath = path.join(process.cwd(), 'src', 'config', 'evaluator_prompt.txt');
            this.evaluatorPrompt = await fs.readFile(evaluatorPath, 'utf-8');

            // Load daily forecast prompt
            const dailyForecastPath = path.join(process.cwd(), 'src', 'config', 'daily_forecast_prompt.txt');
            this.dailyForecastPrompt = await fs.readFile(dailyForecastPath, 'utf-8');

            // Default to astro mode
            this.currentPrompt = this.astroExpertPrompt;

            return true;
        } catch (error) {
            console.error('❌ Error loading prompts:', error);
            throw error;
        }
    }

    /**
     * Set chat mode (tarot or astro)
     * @param {string} mode - 'tarot' or 'astro'
     */
    setChatMode(mode) {
        if (mode === 'tarot') {
            this.currentPrompt = this.tarotExpertPrompt;
            console.log('   ├─ 🔮 Chat mode: Tarot Expert');
        } else if (mode === 'astro') {
            this.currentPrompt = this.astroExpertPrompt;
            console.log('   ├─ ✨ Chat mode: Astrology Expert');
        } else {
            console.warn('   ├─ ⚠️  Unknown chat mode, defaulting to Astrology');
            this.currentPrompt = this.astroExpertPrompt;
        }
    }

    /**
     * Set question type (static or transit)
     * @param {string} type - 'static' or 'transit'
     */
    setQuestionType(type) {
        this.questionType = type;
        if (type === 'static') {
            console.log('   ├─ 📌 Question type: Static (natal chart)');
        } else if (type === 'transit') {
            console.log('   ├─ 🌊 Question type: Transit (current positions)');
        }
    }

    /**
     * Set client-side chart data (natal and transit)
     * @param {Object} natalChart - Natal chart data from client
     * @param {Object} transitChart - Transit chart data from client
     */
    setClientChartData(natalChart = null, transitChart = null) {
        if (natalChart) {
            this.clientChartData.natal = natalChart;
            console.log('   ├─ 📊 Received natal chart from client');
        }
        if (transitChart) {
            this.clientChartData.transit = transitChart;
            console.log('   ├─ 🌊 Received transit chart from client');
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
     * @param {Array} history - Conversation history
     * @param {Array} previousBuffer - Previous buffer blocks
     * @param {string} userId - User ID for fetching profile data
     */
    async updateBuffer(history, previousBuffer = null, userId = null) {
        try {
            // Build the full prompt with system instruction and history
            let fullPrompt = this.currentPrompt + '\n\n';

            // Add user profile data if available
            if (userId && this.userProfileService) {
                console.log(`   ├─ 👤 Fetching profile for user: ${userId.substring(0, 8)}...`);
                const profile = await this.userProfileService.getUserProfile(userId);
                if (profile) {
                    console.log(`   ├─ ✅ Profile found: ${profile.full_name || 'Unknown'}`);
                    const profileContext = this.userProfileService.formatProfileForAI(
                        profile, 
                        this.questionType,
                        this.clientChartData.natal,
                        this.clientChartData.transit
                    );
                    fullPrompt += profileContext;
                } else {
                    console.log(`   ├─ ℹ️  No profile data found for this user`);
                }
            } else {
                if (!userId) {
                    console.log(`   ├─ ℹ️  No userId provided (anonymous user)`);
                }
                if (!this.userProfileService) {
                    console.log(`   ├─ ⚠️  UserProfileService not initialized`);
                }
            }

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

    /**
     * Generate daily astrological forecast based on current planetary positions
     * @param {Object} transitChart - Current planetary positions from client
     * @returns {string} Daily forecast text (3-4 sentences)
     */
    async generateDailyForecast(transitChart) {
        try {
            if (!transitChart) {
                throw new Error('Transit chart data is required for daily forecast');
            }

            // Build the prompt with transit data
            let fullPrompt = this.dailyForecastPrompt + '\n\n';
            fullPrompt += '=== CURRENT PLANETARY POSITIONS ===\n\n';
            fullPrompt += JSON.stringify(transitChart, null, 2);
            fullPrompt += '\n\n=== YOUR TASK ===\n\n';
            fullPrompt += 'Based on the current planetary positions above, generate a daily astrological forecast following the rules specified in the prompt. Remember: 3-4 sentences, practical, grounded, specific.';

            // Generate response using main model
            const result = await this.mainModel.generateContent(fullPrompt);
            const response = await result.response;
            const text = response.text().trim();

            return text;

        } catch (error) {
            console.error('   ├─ ❌ GenerateDailyForecast error:', error.message);
            throw error;
        }
    }
}
