# L.U.M.A.

L.U.M.A. (Lifestyle User Mood Awareness) is a music-based self-reflection application. It connects to Spotify, uses Last.fm community tags to estimate song moods, and stores listening data and shared mood tags in Supabase. L.U.M.A. is intended for reflection and awareness, not medical or mental-health diagnosis.

## Inspiration

We were inspired by the idea that music can reflect how people feel and help people notice changes in their listening habits. We wanted to create a supportive tool that connects music and mood while respecting user privacy.

## What it does

- Connects each user to Spotify with OAuth and PKCE.
- Displays the currently playing song and album artwork.
- Imports Spotify listening history.
- Retrieves community tags from Last.fm.
- Estimates mood, valence, energy, and confidence from music tags.
- Saves listening history, current tracks, and shared moods in Supabase.
- Allows users to add shared mood tags for songs.
- Provides listening trend and mood summaries.

## Technology

- Frontend: HTML, CSS, and JavaScript modules
- Backend: Python, FastAPI, and Uvicorn
- Music data: Spotify Web API and Last.fm API
- Database and authentication: Supabase
- Deployment: GitHub Pages for the frontend and Render for the backend

## Project flow

```text
Spotify → Frontend → FastAPI → Last.fm
                         ↓
                      Supabase
```

The frontend identifies the signed-in L.U.M.A. account. The backend uses that account ID when saving listening data, while song moods and community tags are shared by track.

## Setup

## Reviewing the project

Judges and reviewers do not need access to the Last.fm API key, the Supabase secret key, or the `.env` file. They should use the deployed frontend. The frontend sends requests to the deployed Render backend, and only that backend communicates with Last.fm and Supabase.

For the deployed demo to work, the Render service must have `LASTFM_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY` configured as private environment variables. Do not share these values in the repository or with reviewers. Anyone cloning the repository for local development will need to provide their own environment variables.

### 1. Install backend dependencies

From the project folder:

```powershell
python -m pip install -r requirements.txt
```

### 2. Configure environment variables

Copy the example file:

```powershell
Copy-Item .env.example .env
```

Add the real server-side values to `.env`:

```env
LASTFM_API_KEY=your_lastfm_api_key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your_supabase_secret_key
```

Never commit `.env` or place these values in frontend JavaScript. For the deployed backend, add the same values in the Render environment settings.

### 3. Create the database tables

Run `supabase/schema.sql` in the Supabase SQL Editor. If the `track_moods` table already exists, run this migration too:

```sql
alter table public.track_moods
  add column if not exists valence double precision,
  add column if not exists energy double precision,
  add column if not exists confidence double precision not null default 0;
```

### 4. Start the backend locally

```powershell
python -m uvicorn backend:app --reload --port 8000
```

The API will be available at `http://127.0.0.1:8000` and its interactive documentation is at `http://127.0.0.1:8000/docs`.

## Useful API tests

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/health"
```

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/tracks/mood?artist=Radiohead&title=Karma%20Police"
```

For the deployed service, replace the local URL with the Render backend URL.

## Main endpoints

- `GET /health` — confirms that the backend is running.
- `POST /users/{user_id}/now-playing` — saves a user’s current track.
- `POST /users/{user_id}/events` — saves listening-history events.
- `GET /users/{user_id}/trend` — returns a listening trend report.
- `GET /tracks/mood` — retrieves Last.fm tags and the calculated mood.
- `POST /users/{user_id}/mood-tags` — adds a shared community tag to a song.

## Challenges

We worked through API-key security, Supabase configuration, database schema changes, user-specific data, Spotify access-token timeouts, automatic token refresh, PowerShell and JSON validation errors, deployment issues, and Git merge conflicts.

## What we learned

We learned how frontend, backend, and database systems communicate; how to integrate APIs and authentication; how to protect secrets with environment variables; how to design database schemas; how to troubleshoot deployed services; and how to collaborate with Git branches.

## What's next

We plan to improve the mood algorithm, add richer listening visualizations, improve production security, and support more music services. We also want to add different connected account types, such as parent and child accounts, with appropriate sharing controls and privacy permissions.

## Important note

Mood estimates are based on community music tags and are not medical advice, diagnoses, or definitive statements about a person’s mental health.
