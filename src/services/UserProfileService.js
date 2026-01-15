import { createClient } from '@supabase/supabase-js';

/**
 * UserProfileService - Handles fetching user profile data from Supabase
 */
export class UserProfileService {
    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL;
        // Prefer SERVICE_ROLE_KEY for server-side access (bypasses RLS)
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            console.warn('⚠️  Supabase credentials not configured. User profile features will be disabled.');
            this.supabase = null;
        } else {
            this.supabase = createClient(supabaseUrl, supabaseKey);
            if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
                console.log('✅ Using SERVICE_ROLE_KEY for user profile access (bypasses RLS)');
            } else {
                console.log('ℹ️  Using ANON_KEY for user profile access (requires RLS policies)');
            }
        }
    }

    /**
     * Fetch user profile by user_id
     * @param {string} userId - The Supabase user ID
     * @returns {Promise<Object|null>} User profile data or null if not found
     */
    async getUserProfile(userId) {
        if (!this.supabase) {
            console.log(`   ├─ ⚠️  Supabase client not initialized`);
            return null;
        }

        try {
            console.log(`   ├─ 🔍 Querying user_profiles table for user_id: ${userId}`);
            
            const { data, error } = await this.supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) {
                console.log(`   ├─ ❌ Supabase error:`, error);
                if (error.code === 'PGRST116') {
                    console.log(`   ├─ ℹ️  No profile found for user: ${userId.substring(0, 8)}`);
                    return null;
                }
                throw error;
            }

            if (!data) {
                console.log(`   ├─ ℹ️  Query returned no data`);
                return null;
            }

            console.log(`   ├─ 📦 Raw data received:`, {
                id: data.id?.substring(0, 8),
                user_id: data.user_id?.substring(0, 8),
                full_name: data.full_name,
                has_astrology_data: !!data.astrology_data
            });

            if (data && data.astrology_data) {
                try {
                    if (typeof data.astrology_data === 'string') {
                        data.astrology_data = JSON.parse(data.astrology_data);
                    }
                } catch (parseError) {
                    console.error('   ├─ ⚠️  Failed to parse astrology_data:', parseError.message);
                }
            }

            return data;
        } catch (error) {
            console.error('   ├─ ❌ Error fetching user profile:', error.message);
            console.error('   ├─ Error details:', error);
            return null;
        }
    }

    /**
     * Format user profile data for AI context
     * @param {Object} profile - User profile from database
     * @returns {string} Formatted text for AI prompt
     */
    formatProfileForAI(profile) {
        if (!profile) {
            return '';
        }

        let formatted = '\n=== USER PROFILE ===\n\n';
        
        if (profile.full_name) {
            formatted += `Name: ${profile.full_name}\n`;
        }
        
        if (profile.birth_date_time) {
            formatted += `Birth Date/Time: ${profile.birth_date_time}\n`;
        }
        
        if (profile.birth_place) {
            formatted += `Birth Place: ${profile.birth_place}\n`;
        }
        
        if (profile.timezone) {
            formatted += `Timezone: ${profile.timezone}\n`;
        }

        if (profile.astrology_data && typeof profile.astrology_data === 'object') {
            formatted += '\n=== ASTROLOGY DATA ===\n\n';
            
            const planets = ['sun', 'moon', 'ascendant', 'mercury', 'venus', 'mars', 
                           'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron'];
            
            planets.forEach(planet => {
                if (profile.astrology_data[planet]) {
                    const data = profile.astrology_data[planet];
                    formatted += `${planet.charAt(0).toUpperCase() + planet.slice(1)}: ${data.sign}`;
                    if (data.house) {
                        formatted += `, House ${data.house}`;
                    }
                    if (data.isRetrograde) {
                        formatted += ' (Retrograde)';
                    }
                    formatted += '\n';
                }
            });
        }

        formatted += '\n';
        return formatted;
    }
}
