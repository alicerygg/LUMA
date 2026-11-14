-- L.U.M.A. database tables.
-- Run this in Supabase Dashboard -> SQL Editor.

create table if not exists public.listening_events (
  event_id text primary key,
  user_id text not null,
  track_id text not null,
  title text not null,
  artist text not null,
  album text,
  album_art_url text,
  spotify_url text,
  is_playing boolean,
  explicit boolean not null default false,
  played_at timestamptz not null,
  genre text,
  energy double precision check (energy is null or (energy >= 0 and energy <= 1)),
  valence double precision check (valence is null or (valence >= 0 and valence <= 1)),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists listening_events_user_played_at_idx
  on public.listening_events (user_id, played_at);

create table if not exists public.current_tracks (
  user_id text primary key,
  track_id text not null,
  title text not null,
  artist text not null,
  album text,
  album_art_url text,
  spotify_url text,
  explicit boolean not null default false,
  is_playing boolean not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.track_moods (
  cache_key text primary key,
  artist text not null,
  title text not null,
  tags text[] not null default '{}',
  estimated_mood text,
  source text not null,
  fetched_at timestamptz not null default now()
);

-- The backend uses the service-role key, so it can access these tables.
-- Keep that key on the server and never put it in frontend JavaScript.
alter table public.listening_events enable row level security;
alter table public.current_tracks enable row level security;
alter table public.track_moods enable row level security;
