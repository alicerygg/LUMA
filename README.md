# Moon backend starter

This is the first integration-ready Python service for Moon.

## Run it

```powershell
python -m pip install -r requirements.txt
python -m uvicorn backend:app --reload
```

Copy `.env.example` to `.env` and fill in `LASTFM_API_KEY`, `SUPABASE_URL`,
and `SUPABASE_SECRET_KEY`. The backend fetches tags from Last.fm, estimates
the mood, and upserts the result into the `track_moods` Supabase table.
Keep these values server-side; do not put them in frontend JavaScript.

Then open `http://127.0.0.1:8000/docs` for the interactive API page.

## Current endpoints

- `GET /health`
- `POST /events` — accepts normalized listening events
- `GET /users/{user_id}/trend` — returns an explainable trend result

The current event store is in memory so the service can be started immediately. Replace `events_by_user` with Supabase reads/writes after the database schema is finalized.

The trend result is an observation about listening behavior, not a mental-health diagnosis.
