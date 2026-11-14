# L.U.M.A.

L.U.M.A. (Lifestyle User Mood Awareness) is a music-based self-reflection application. It connects to Spotify, uses Last.fm community tags to estimate song moods, and stores listening data and shared mood tags in Supabase. Mood estimates are for reflection and awareness, not medical diagnosis.

## Features

- Spotify login using OAuth and PKCE.
- Currently playing song and album artwork display.
- Spotify listening-history import.
- Last.fm community tags and estimated mood, valence, energy, and confidence.
- Shared community mood tags for songs.
- Supabase authentication and database storage.
- Listening trends, mood trends, and listening statistics.
- Separate data for each L.U.M.A. account.

## Architecture

```text
Spotify → Frontend → FastAPI → Last.fm
                         ↓
                      Supabase
```

The frontend is made with HTML, CSS, and JavaScript modules. FastAPI provides the backend API. Last.fm supplies music tags. Supabase stores accounts, current tracks, listening history, song moods, and shared tags.

Song moods and community tags are shared by track. Listening history and current-track data are associated with the individual L.U.M.A. account.

## Project structure

- `index.html` — login page.
- `dashboard.html` — currently playing song and mood dashboard.
- `listening-history.html` — listening-history page.
- `mood-trends.html` — mood-trends page.
- `js/` — frontend modules, authentication, Spotify integration, and backend requests.
- `backend.py` — FastAPI application and API routes.
- `supabase/schema.sql` — database table definitions.
- `requirements.txt` — Python backend dependencies.

## Local setup

### Install dependencies

From the project folder:

```powershell
python -m pip install -r requirements.txt
```

### Configure environment variables

Copy the template:

```powershell
Copy-Item .env.example .env
```

Add the real server-side values to `.env`:

```env
LASTFM_API_KEY=your_lastfm_api_key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your_supabase_secret_key
```

Never commit `.env` or place the Last.fm key or Supabase secret key in frontend code.

### Configure Supabase

Run `supabase/schema.sql` in the Supabase SQL Editor. If the `track_moods` table already exists, apply this migration as well:

```sql
alter table public.track_moods
  add column if not exists valence double precision,
  add column if not exists energy double precision,
  add column if not exists confidence double precision not null default 0;
```

### Start the backend

```powershell
python -m uvicorn backend:app --reload --port 8000
```

The local API is available at `http://127.0.0.1:8000`. Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

## API tests

Test that the backend is running:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/health"
```

Test Last.fm and the mood cache:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/tracks/mood?artist=Radiohead&title=Karma%20Police"
```

For production, replace the local URL with the deployed Render backend URL.

## Main API routes

- `GET /health` — confirms that the backend is running.
- `POST /events` — saves events that include a user ID.
- `POST /users/{user_id}/events` — saves listening-history events for a user.
- `POST /users/{user_id}/now-playing` — saves the user’s current track.
- `GET /users/{user_id}/now-playing` — retrieves the user’s current track.
- `GET /users/{user_id}/trend` — returns a listening trend report.
- `GET /users/{user_id}/mood-trends` — returns mood trend summaries.
- `GET /users/{user_id}/listening-stats` — returns listening statistics.
- `GET /tracks/mood` — retrieves Last.fm tags and the calculated mood.
- `POST /users/{user_id}/mood-tags` — adds a shared community tag to a song.

## Deployment and review

The frontend can be hosted on GitHub Pages and the FastAPI backend can be hosted on Render. The production frontend is configured to call the deployed backend rather than a local computer.

Reviewers only need the deployed frontend URL. They should not receive the `.env` file, Last.fm API key, or Supabase secret key. Configure those values as private environment variables in Render. Anyone running the backend locally needs to provide their own environment variables.

## Security notes

- Keep `.env` out of Git.
- Keep `SUPABASE_SECRET_KEY` on the backend only.
- The frontend may use a Supabase publishable key for authentication, but it must never contain the Supabase secret/service-role key.
- Mood results are estimates based on music tags and are not medical advice.

## Future work

Planned improvements include better mood classification, richer visualizations, stronger production permissions, more music services, and connected account types such as parent and child accounts with appropriate privacy controls.
