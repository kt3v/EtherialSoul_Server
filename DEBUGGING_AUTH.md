# Debugging Authentication & User Profile Integration

## Current Status

The server now has detailed logging to track the authentication flow and user profile fetching.

## What to Check

### 1. Server Logs on Connection

When a client connects, you should see:

```
🔐 Auth Middleware:
   ├─ Token present: true/false
   ├─ JWT Secret configured: true/false
   └─ [Status message]

🔌 Client connected: [socket_id]
   ✅ Authenticated as: [email]
   🆔 User DB ID: [user_id]
   📊 Profile will be loaded for AI context
```

**OR** for anonymous users:

```
🔌 Client connected: [socket_id]
   ⚠️  Anonymous user (no auth token)
   ℹ️  AI will respond without user profile data
```

### 2. Server Logs on Message

When user sends a message:

```
💬 USER [[email] ([user_id])]: "[message]"
   ├─ 🆕 No active buffer, generating response...

🤖 AI: Generating response...
   ├─ 🔑 Authenticated user ID: [user_id]...
   ├─ 👤 Fetching profile for user: [user_id]...
   ├─ ✅ Profile found: [full_name]
   ├─ 💾 Context saved to: logs/[filename]
```

**OR** for anonymous:

```
💬 USER [Anonymous]: "[message]"
   ├─ 🆕 No active buffer, generating response...

🤖 AI: Generating response...
   ├─ ⚠️  No authenticated user ID (anonymous session)
   ├─ ℹ️  No userId provided (anonymous user)
```

## Common Issues & Solutions

### Issue 1: "Token present: false"

**Cause:** Client is not sending the auth token

**Solution:** 
1. Check that user is logged in on the client
2. Verify `supabase.auth.getSession()` returns a valid session
3. Check client console for auth errors

### Issue 2: "JWT Secret configured: false"

**Cause:** `SUPABASE_JWT_SECRET` not in server `.env`

**Solution:**
1. Add to `.env`: `SUPABASE_JWT_SECRET=your_jwt_secret`
2. Get JWT secret from Supabase Dashboard → Project Settings → API → JWT Secret
3. Restart server

### Issue 3: "Invalid token: [error]"

**Cause:** Token is expired or JWT secret is wrong

**Solution:**
1. Verify JWT secret matches your Supabase project
2. Check token expiration (user may need to re-login)
3. Ensure client and server are using the same Supabase project

### Issue 4: "No profile data found for this user"

**Cause:** User is authenticated but has no profile in `user_profiles` table

**Solution:**
1. Check if user has filled out their profile data in the app
2. Verify `user_profiles` table has a row with matching `user_id`
3. Check that `astrology_data` column is populated

### Issue 5: "Supabase credentials not configured"

**Cause:** `SUPABASE_ANON_KEY` not in server `.env`

**Solution:**
1. Add to `.env`: `SUPABASE_ANON_KEY=your_anon_key`
2. Get anon key from Supabase Dashboard → Project Settings → API → anon/public key
3. Restart server

## Testing Checklist

- [ ] Server starts without warnings
- [ ] `SUPABASE_JWT_SECRET` is configured
- [ ] `SUPABASE_ANON_KEY` is configured
- [ ] Client connects with "✅ Authenticated as: [email]"
- [ ] User ID is shown in connection logs
- [ ] Profile fetching shows "✅ Profile found: [name]"
- [ ] AI context includes user profile data (check logs/update_buffer_*.txt)
- [ ] AI responds with personalized astrological insights

## Verifying Profile Data in AI Context

Check the log file in `logs/update_buffer_*.txt` for:

```
=== USER PROFILE ===

Name: [full_name]
Birth Date/Time: [timestamp]
Birth Place: [location]
Timezone: [timezone]

=== ASTROLOGY DATA ===

Sun: [sign], House [number]
Moon: [sign], House [number]
Ascendant: [sign], House [number]
...
```

If this section is missing, the profile was not loaded.
