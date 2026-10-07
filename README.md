<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# רומיקוב ישראלי אונליין — Israeli Rummikub Multiplayer

Real-time multiplayer Rummikub in Hebrew, with an optional Gemini AI bot.

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables — copy the example and fill in your values:
   ```
   cp .env.example .env.local
   ```
   Then edit `.env.local`:
   - `GEMINI_API_KEY` — get a free key at https://aistudio.google.com/app/apikey  
     Without this key the bot uses the built-in heuristic (still fully playable).
   - `GEMINI_MODEL` — default is `gemini-2.0-flash`. Only change if you get a "model not found" error.

   > **Note:** the server loads `.env.local` first, then `.env` as a fallback.  
   > Both files are gitignored — never commit real keys.

3. Run the app:
   ```
   npm run dev
   ```

4. (Optional) Test the Gemini bot without playing a full game:
   ```
   npm run test:bot
   ```
   This prints `source=gemini` if the key works, or `source=fallback reason=missing-key` if not.

## Deploy to Render

1. Push the repo to GitHub.
2. Create a **Web Service** on [render.com](https://render.com) connected to your repo.
3. Set these fields:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Node version:** `18`
   - **Health Check Path:** `/api/health`
4. In the **Environment** tab on Render, add:
   - `NODE_ENV` = `production`
   - `GEMINI_API_KEY` = your key *(do NOT put it in any file — set it here)*
   - `GEMINI_MODEL` = `gemini-2.0-flash` *(optional)*

   > On Render the platform injects variables directly into `process.env`.  
   > `dotenv` is not needed and is not called in production.

5. After deploy, verify at `https://your-app.onrender.com/api/health` — you should see `"geminiConfigured": true`.
