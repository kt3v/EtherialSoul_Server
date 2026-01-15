# Astrology Integration - User Profile Data

## Overview
This document describes the integration of user profile data and astrology features into the EtherialSoul server.

## Changes Made

### 1. New Astrology-Focused Prompt (`prompt2.txt`)
- **Location:** `src/config/prompt2.txt`
- **Features:**
  - Dual-engine approach: Astrology (Strategy) + Tarot (Tactics)
  - Astrology provides long-term character analysis and patterns
  - Tarot provides immediate situational guidance
  - Maintains the same texting style and JSON response format
  - Now **ACTIVE** as the main prompt

### 2. User Profile Service
- **Location:** `src/services/UserProfileService.js`
- **Purpose:** Fetches user profile data from Supabase
- **Features:**
  - Retrieves user profiles by `user_id`
  - Parses astrology data from JSON string
  - Formats profile data for AI context
  - Gracefully handles missing profiles

### 3. Updated GeminiService
- **Location:** `src/services/GeminiService.js`
- **Changes:**
  - Now accepts `UserProfileService` in constructor
  - `updateBuffer()` method now accepts `userId` parameter
  - Automatically fetches and includes user profile data in AI context
  - Switched from `prompt.txt` to `prompt2.txt`

### 4. Updated StateOrchestrator
- **Location:** `src/managers/StateOrchestrator.js`
- **Changes:**
  - Extracts authenticated user ID from socket
  - Passes user ID to `updateBuffer()` for profile fetching

### 5. Updated Server Initialization
- **Location:** `src/index.js`
- **Changes:**
  - Initializes `UserProfileService`
  - Passes service to `GeminiService` constructor

### 6. Environment Configuration
- **Location:** `.env.example`
- **New Variable:** `SUPABASE_ANON_KEY`
- **Required for:** Fetching user profiles from Supabase

## User Profile Data Structure

The system expects the following data from Supabase `user_profiles` table:

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "full_name": "string",
  "birth_place": "string",
  "birth_latitude": number,
  "birth_longitude": number,
  "timezone": "string",
  "birth_date_time": "timestamp",
  "utc_offset": "string",
  "astrology_data": {
    "sun": { "sign": "string", "house": number, "degree": number, "isRetrograde": boolean },
    "moon": { "sign": "string", "house": number, "degree": number, "isRetrograde": boolean },
    "ascendant": { "sign": "string", "house": number, "degree": number },
    "mercury": { ... },
    "venus": { ... },
    "mars": { ... },
    "jupiter": { ... },
    "saturn": { ... },
    "uranus": { ... },
    "neptune": { ... },
    "pluto": { ... },
    "chiron": { ... },
    "sirius": { ... }
  }
}
```

## How It Works

1. **User connects** with authentication token
2. **Socket middleware** validates token and attaches user info to socket
3. **User sends message** to AI
4. **StateOrchestrator** extracts authenticated user ID from socket
5. **GeminiService** fetches user profile using `UserProfileService`
6. **Profile data** is formatted and added to AI context
7. **AI generates response** using astrology data and new prompt
8. **Response sent** to user with personalized astrological insights

## Configuration Required

Add to your `.env` file:

```bash
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

## Benefits

- **Personalized responses** based on user's astrological chart
- **Dual approach** combining strategic (astrology) and tactical (tarot) guidance
- **Automatic integration** - no changes needed on client side
- **Graceful degradation** - works without profile data for anonymous users
- **Maintains compatibility** with existing conversation flow

## Testing

To test the integration:

1. Ensure `.env` has `SUPABASE_ANON_KEY` configured
2. Start the server: `npm start`
3. Connect with authenticated user who has profile data
4. Send messages and observe AI responses incorporating astrology
5. Check logs for profile fetching confirmation

## Notes

- Anonymous users (no auth token) will still get responses without astrology data
- Users without profile data will get standard responses
- Profile data is fetched fresh for each AI response generation
- All astrology data is included in the AI context for comprehensive analysis
