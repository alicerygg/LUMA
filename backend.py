# Standard-library tools used for timestamps, averages, and type hints.
from datetime import datetime, timezone
import json
import os
from statistics import mean
from typing import Any, List, Optional
from urllib.parse import urlencode
from urllib.request import urlopen
from collections import Counter
from datetime import timedelta

from dotenv import load_dotenv

# FastAPI creates the web server and HTTPException lets us return clear errors.
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
# Pydantic validates incoming JSON and converts it into Python objects.
from pydantic import AliasChoices, BaseModel, ConfigDict, Field


# Load local development secrets from .env. Production deployments should
# provide the same values through their secret/environment configuration.
load_dotenv()

# Supabase is optional during local development. Without credentials, the
# backend continues using its temporary in-memory stores.
try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover - used only before dependencies install
    Client = Any
    create_client = None


# This object is the FastAPI application that Uvicorn runs.
app = FastAPI(title="Moon Trend Backend", version="0.1.0")

SUPABASE_URL = os.getenv("SUPABASE_URL")
# Supabase now calls this the secret key (`sb_secret_...`). The legacy
# service-role variable is accepted as a fallback for older projects.
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY") or os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY"
)
supabase_client: Optional[Client] = None

if create_client and SUPABASE_URL and SUPABASE_SECRET_KEY:
    # The secret key is server-only and must never be sent to the browser.
    supabase_client = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

# Allow the local frontend dev server to call this backend from the browser.
# These origins are for local development only; production should use the
# frontend's real domain instead.
# Browser origins allowed to call this backend.
# Include both local development and deployed frontend URLs.

FRONTEND_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://alicerygg.github.io",
]

# Set this variable on Render to your deployed frontend origin.
production_frontend = os.getenv("FRONTEND_URL")

if production_frontend:
    FRONTEND_ORIGINS.append(
        production_frontend.rstrip("/")
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Each tag contributes:
# (valence, energy, weight)
#
# Valence: -1 = negative, +1 = positive
# Energy:  0 = calm, 1 = intense

TAG_MOOD_WEIGHTS = {
    "happy":       (0.9, 0.7, 1.0),
    "joyful":      (1.0, 0.8, 1.0),
    "upbeat":      (0.8, 0.9, 1.0),
    "energetic":   (0.3, 1.0, 1.0),
    "dance":       (0.6, 0.9, 0.8),
    "party":       (0.8, 1.0, 0.9),

    "sad":         (-0.9, 0.2, 1.0),
    "melancholic": (-0.8, 0.2, 1.0),
    "dark":        (-0.6, 0.5, 0.7),
    "angry":       (-0.8, 1.0, 1.0),

    "calm":        (0.3, 0.1, 1.0),
    "peaceful":    (0.7, 0.1, 1.0),
    "relaxed":     (0.5, 0.2, 1.0),
    "chill":       (0.3, 0.3, 0.8),

    "romantic":    (0.7, 0.4, 0.9),
    "love":        (0.7, 0.5, 0.8),
    "nostalgic":   (-0.2, 0.3, 0.6),
    "dreamy":      (0.2, 0.2, 0.7),
}

def calculate_song_mood(tags: list[str]) -> dict:
    """
    Estimate valence and energy from Last.fm tags.

    Returns scores, a label, and a basic confidence
    indicator based on available matching tags.
    """

    total_valence = 0.0
    total_energy = 0.0
    total_weight = 0.0
    matched_tags = []

    for tag in tags:
        normalized = tag.strip().casefold()

        if normalized not in TAG_MOOD_WEIGHTS:
            continue

        valence, energy, weight = TAG_MOOD_WEIGHTS[normalized]

        total_valence += valence * weight
        total_energy += energy * weight
        total_weight += weight
        matched_tags.append(normalized)

    if total_weight == 0:
        return {
            "valence": None,
            "energy": None,
            "mood": "unknown",
            "confidence": 0.0,
            "matched_tags": []
        }

    valence = total_valence / total_weight
    energy = total_energy / total_weight

    if valence >= 0:
        mood = "energetic" if energy >= 0.5 else "content"
    else:
        mood = "intense" if energy >= 0.5 else "reflective"

    # Simple evidence-coverage indicator, not a
    # statistically calibrated probability.
    confidence = min(len(matched_tags) / 5, 1.0)

    return {
        "valence": round(valence, 3),
        "energy": round(energy, 3),
        "mood": mood,
        "confidence": round(confidence, 2),
        "matched_tags": matched_tags
    }


class ListeningEvent(BaseModel):
    """One song-play record from the user's listening history."""

    model_config = ConfigDict(populate_by_name=True)

    # The API payload uses the friend's field names; the Python names keep the
    # trend calculation readable.
    user_id: str = "default"
    event_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("eventId", "event_id"),
    )
    track_id: str = Field(validation_alias=AliasChoices("id", "track_id"))
    title: str
    artist: str
    album: Optional[str] = None
    album_art_url: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("albumArt", "album_art_url"),
    )
    spotify_url: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("spotifyUrl", "spotify_url"),
    )
    is_playing: Optional[bool] = Field(
        default=None,
        validation_alias=AliasChoices("isPlaying", "is_playing"),
    )
    explicit: bool = False
    played_at: datetime = Field(
        validation_alias=AliasChoices("playedAt", "played_at"),
    )
    # Optional enrichment fields used by the trend calculator when available.
    genre: Optional[str] = None
    energy: Optional[float] = Field(default=None, ge=0, le=1)
    valence: Optional[float] = Field(default=None, ge=-1, le=1)
    # The source payload does not provide duration. It remains available for
    # older clients and defaults to zero for trend calculations.
    duration_seconds: int = Field(default=0, ge=0)


class CurrentTrack(BaseModel):
    """The track currently playing for a user."""

    model_config = ConfigDict(populate_by_name=True)

    track_id: str = Field(validation_alias=AliasChoices("id", "track_id"))
    title: str
    artist: str
    album: Optional[str] = None
    album_art_url: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("albumArt", "album_art_url"),
    )
    spotify_url: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("spotifyUrl", "spotify_url"),
    )
    explicit: bool = False
    is_playing: bool = Field(
        validation_alias=AliasChoices("isPlaying", "is_playing"),
    )


class TrendResponse(BaseModel):
    """The explanation returned after comparing older and newer listening."""

    user_id: str
    status: str
    headline: str
    summary: str
    reasons: List[str]
    trend_strength: float = Field(ge=0, le=1)
    updated_at: datetime


class TrackMoodResponse(BaseModel):
    artist: str
    title: str
    tags: list[str]

    estimated_mood: Optional[str] = None

    valence: Optional[float] = None
    energy: Optional[float] = None
    confidence: float = 0.0

    source: str
    cached: bool
    fetched_at: datetime


class UserMoodTag(BaseModel):
    """A private mood label added by one user for one track."""

    artist: str
    title: str
    mood_tag: str = Field(min_length=1, max_length=40)


# Temporary in-memory stores.
# These reset whenever the server restarts. Supabase can replace them later
# without changing the public endpoint structure.
events_by_user: dict[str, list[ListeningEvent]] = {}
current_track_by_user: dict[str, CurrentTrack] = {}
# Shared across users: the same song should only need one Last.fm lookup.
track_moods_by_key: dict[str, TrackMoodResponse] = {}


def supabase_is_configured() -> bool:
    """Return whether database-backed storage is ready."""
    return supabase_client is not None


def event_database_row(event: ListeningEvent, user_id: str) -> dict[str, Any]:
    """Convert a validated event into the database column format."""
    data = event.model_dump()
    data["user_id"] = user_id
    # Older test payloads may omit eventId; create a stable fallback key.
    data["event_id"] = (
        f"{user_id}:{event.track_id}:{event.played_at.isoformat()}"
    )
    return data


def make_track_key(artist: str, title: str) -> str:
    """Create a consistent cache key despite capitalization or whitespace."""
    return f"{artist.strip().casefold()}::{title.strip().casefold()}"



def fetch_lastfm_tags(artist: str, title: str) -> list[str]:
    """Fetch public community tags from Last.fm for one track."""
    api_key = os.getenv("LASTFM_API_KEY")
    if not api_key:
        raise RuntimeError("LASTFM_API_KEY is not configured")

    query = urlencode({
        "method": "track.getTopTags",
        "artist": artist,
        "track": title,
        "api_key": api_key,
        "format": "json",
    })
    with urlopen(f"https://ws.audioscrobbler.com/2.0/?{query}", timeout=10) as response:
        payload = json.load(response)

    # Last.fm can return HTTP 200 with an error object, so do not silently
    # treat an invalid key or failed lookup as an empty tag list.
    if "error" in payload:
        message = payload.get("message", "Unknown Last.fm error")
        raise RuntimeError(f"Last.fm error {payload['error']}: {message}")

    return [
        tag["name"]
        for tag in payload.get("toptags", {}).get("tag", [])
        if tag.get("name")
    ]


@app.get("/health")
def health() -> dict[str, str]:
    """Confirm that the backend is running."""
    return {"status": "ok"}


@app.post("/events", status_code=201)
def add_events(events: List[ListeningEvent]) -> dict[str, int]:
    """Store history events when each event already contains a user_id."""
    # Reject an empty list so the caller knows no data was saved.
    if not events:
        raise HTTPException(status_code=400, detail="At least one event is required")

    if supabase_is_configured():
        rows = [event_database_row(event, event.user_id) for event in events]
        supabase_client.table("listening_events").upsert(
            rows, on_conflict="event_id"
        ).execute()
    else:
        # Create the user's list if needed, then append each history record.
        for event in events:
            events_by_user.setdefault(event.user_id, []).append(event)

    return {"events_received": len(events)}


@app.post("/users/{user_id}/events", status_code=201)
def add_user_events(user_id: str, events: List[ListeningEvent]) -> dict[str, int]:
    """Store the friend's payload for a specific user."""
    # This route gets the user_id from the URL instead of the JSON body.
    if not events:
        raise HTTPException(status_code=400, detail="At least one event is required")

    if supabase_is_configured():
        rows = [event_database_row(event, user_id) for event in events]
        supabase_client.table("listening_events").upsert(
            rows, on_conflict="event_id"
        ).execute()
    else:
        for event in events:
            # Apply the URL user_id to every submitted event before storing it.
            event.user_id = user_id
            events_by_user.setdefault(user_id, []).append(event)

    return {"events_received": len(events)}


@app.post("/users/{user_id}/now-playing", status_code=200)
def update_now_playing(user_id: str, track: CurrentTrack) -> dict[str, str]:
    """Save or replace the user's currently playing track."""
    if supabase_is_configured():
        row = track.model_dump()
        row["user_id"] = user_id
        supabase_client.table("current_tracks").upsert(
            row, on_conflict="user_id"
        ).execute()
    else:
        current_track_by_user[user_id] = track
    return {"status": "updated", "user_id": user_id}


@app.get("/users/{user_id}/now-playing", response_model=CurrentTrack)
def get_now_playing(user_id: str) -> CurrentTrack:
    """Return the user's current track, if one has been submitted."""
    if supabase_is_configured():
        result = (
            supabase_client.table("current_tracks")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        track = CurrentTrack.model_validate(result.data[0]) if result.data else None
    else:
        track = current_track_by_user.get(user_id)
    if track is None:
        raise HTTPException(status_code=404, detail="No current track found")
    return track


def calculate_trend(user_events: list[ListeningEvent]) -> TrendResponse:
    """Compare the older half of a user's history with the newer half."""
    # A single record is not enough to identify a change over time.
    if len(user_events) < 2:
        return TrendResponse(
            user_id=user_events[0].user_id,
            status="insufficient_data",
            headline="Keep listening to establish your pattern",
            summary="Moon needs more listening history before it can identify a change.",
            reasons=[],
            trend_strength=0.0,
            updated_at=datetime.now(timezone.utc),
        )

    # Chronological order makes the first half the earlier pattern and the
    # second half the recent pattern.
    ordered = sorted(user_events, key=lambda event: event.played_at)
    midpoint = len(ordered) // 2
    previous = ordered[:midpoint]
    recent = ordered[midpoint:]
    reasons: list[str] = []
    change_scores: list[float] = []

    # Compare total listening time when duration data is available.
    previous_minutes = sum(e.duration_seconds for e in previous) / 60
    recent_minutes = sum(e.duration_seconds for e in recent) / 60
    if previous_minutes > 0:
        listening_change = abs(recent_minutes - previous_minutes) / previous_minutes
        if listening_change >= 0.40:
            direction = "higher" if recent_minutes > previous_minutes else "lower"
            reasons.append(f"Listening time is {direction} than your earlier pattern.")
            change_scores.append(min(listening_change, 1.0))

    # A higher repeat score means the user listened to fewer unique tracks.
    previous_repeats = 1 - len({e.track_id for e in previous}) / len(previous)
    recent_repeats = 1 - len({e.track_id for e in recent}) / len(recent)
    repeat_change = abs(recent_repeats - previous_repeats)
    if repeat_change >= 0.25:
        reasons.append("Song repetition changed noticeably.")
        change_scores.append(min(repeat_change, 1.0))

    # Compare the proportion of unique artists in each time period.
    previous_artists = len({e.artist for e in previous}) / len(previous)
    recent_artists = len({e.artist for e in recent}) / len(recent)
    variety_change = abs(recent_artists - previous_artists)
    if variety_change >= 0.25:
        reasons.append("Artist variety changed noticeably.")
        change_scores.append(min(variety_change, 1.0))

    # Energy is optional, so only compare it when both periods contain values.
    previous_energy = [e.energy for e in previous if e.energy is not None]
    recent_energy = [e.energy for e in recent if e.energy is not None]
    if previous_energy and recent_energy:
        energy_change = abs(mean(recent_energy) - mean(previous_energy))
        if energy_change >= 0.20:
            reasons.append("Average music energy changed noticeably.")
            change_scores.append(min(energy_change, 1.0))

    # Average all detected changes and cap the result at 1.0.
    strength = min(mean(change_scores) if change_scores else 0.0, 1.0)

    # Convert the numeric result into a simple status and user-facing message.
    if not reasons:
        status = "stable"
        headline = "Your listening pattern looks steady"
        summary = "No major change was found in the available listening history."
    elif strength >= 0.50:
        status = "check_in"
        headline = "Your listening pattern shifted"
        summary = "Some parts of your recent listening differ from your earlier pattern."
    else:
        status = "noticeable_change"
        headline = "A small listening change appeared"
        summary = "Moon noticed a change worth checking in about."

    return TrendResponse(
        user_id=ordered[0].user_id,
        status=status,
        headline=headline,
        summary=summary,
        reasons=reasons,
        trend_strength=round(strength, 2),
        updated_at=datetime.now(timezone.utc),
    )


@app.get("/users/{user_id}/trend", response_model=TrendResponse)
def get_trend(user_id: str) -> TrendResponse:
    """Return a trend report for the user's stored listening history."""
    # Return 404 instead of calculating a trend from missing data.
    if supabase_is_configured():
        result = (
            supabase_client.table("listening_events")
            .select("*")
            .eq("user_id", user_id)
            .order("played_at")
            .execute()
        )
        user_events = [ListeningEvent.model_validate(row) for row in result.data]
    else:
        user_events = events_by_user.get(user_id, [])
    if not user_events:
        raise HTTPException(status_code=404, detail="No listening events found")
    return calculate_trend(user_events)


@app.get("/tracks/mood", response_model=TrackMoodResponse)
def get_track_mood(artist: str, title: str) -> TrackMoodResponse:
    """Return a cached mood, or ask Last.fm once for this new track."""
    cache_key = make_track_key(artist, title)
    try:
        if supabase_is_configured():
            result = (
                supabase_client.table("track_moods")
                .select("*")
                .eq("cache_key", cache_key)
                .limit(1)
                .execute()
            )
            cached = (
                TrackMoodResponse.model_validate({**result.data[0], "cached": True})
                if result.data
                else None
            )
        else:
            cached = track_moods_by_key.get(cache_key)
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail=f"Supabase mood lookup failed: {error}",
        ) from error
    if cached:

        # Recalculate mood using the stored Last.fm tags.
        # This avoids unnecessary external API requests.
        classification = calculate_song_mood(cached.tags)

        updated = cached.model_copy(
            update={
                "estimated_mood": classification["mood"],
                "valence": classification["valence"],
                "energy": classification["energy"],
                "confidence": classification["confidence"],
                "cached": True,
            }
        )

        return updated

    try:
        tags = fetch_lastfm_tags(artist, title)

        classification = calculate_song_mood(tags)

        result = TrackMoodResponse(
            artist=artist,
            title=title,
            tags=tags,
            estimated_mood=classification["mood"],
            valence=classification["valence"],
            energy=classification["energy"],
            confidence=classification["confidence"],
            source="last.fm",
            cached=False,
            fetched_at=datetime.now(timezone.utc)
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Last.fm lookup failed: {error}") from error
    try:
        if supabase_is_configured():
            supabase_client.table("track_moods").upsert(
                {
                    "cache_key": cache_key,
                    "artist": result.artist,
                    "title": result.title,
                    "tags": result.tags,
                    "estimated_mood": result.estimated_mood,

                    # New classification fields
                    "valence": result.valence,
                    "energy": result.energy,
                    "confidence": result.confidence,

                    "source": result.source,
                    "fetched_at": result.fetched_at.isoformat(),
                },
                on_conflict="cache_key",
            ).execute()
        else:
            track_moods_by_key[cache_key] = result
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail=f"Supabase mood save failed: {error}",
        ) from error
    return result


@app.post("/users/{user_id}/mood-tags", status_code=201)
def save_user_mood_tag(user_id: str, tag: UserMoodTag) -> dict[str, str]:
    """Add a shared community mood label to a track's tags."""
    cache_key = make_track_key(tag.artist, tag.title)
    mood_tag = tag.mood_tag.strip()
    if not mood_tag:
        raise HTTPException(status_code=400, detail="Mood tag cannot be empty")

    if supabase_is_configured():
        try:
            existing = (
                supabase_client.table("track_moods")
                .select("*")
                .eq("cache_key", cache_key)
                .limit(1)
                .execute()
            )
            current = existing.data[0] if existing.data else {}
            tags = list(current.get("tags") or [])

            # Add the new tag if it isn't already present.
            if mood_tag.casefold() not in {item.casefold() for item in tags}:
                tags.append(mood_tag)

            # Recalculate after adding the new tag.
            classification = calculate_song_mood(tags)
            supabase_client.table("track_moods").upsert(
                {
                    "cache_key": cache_key,
                    "artist": current.get("artist", tag.artist),
                    "title": current.get("title", tag.title),
                    "tags": tags,
                    "estimated_mood": classification["mood"],
                    "valence": classification["valence"],
                    "energy": classification["energy"],
                    "confidence": classification["confidence"],
                    "source": current.get("source", "community"),
                    "fetched_at": current.get(
                        "fetched_at", datetime.now(timezone.utc).isoformat()
                    ),
                },
                on_conflict="cache_key",
            ).execute()
        except Exception as error:
            raise HTTPException(
                status_code=503,
                detail=f"Supabase mood tag save failed: {error}",
            ) from error
        else:
        # Supabase is not configured.
        # Store the updated classification in memory instead.

            current = track_moods_by_key.get(cache_key)

            if current:
                # Retrieve the existing song's tags.
                tags = list(current.tags)

                # Avoid adding duplicate tags.
                if mood_tag.casefold() not in {
                    item.casefold() for item in tags
                }:
                    tags.append(mood_tag)

                # Recalculate the mood using all available tags.
                classification = calculate_song_mood(tags)

                # Update the existing cached song.
                track_moods_by_key[cache_key] = current.model_copy(
                    update={
                        "tags": tags,
                        "estimated_mood": classification["mood"],
                        "valence": classification["valence"],
                        "energy": classification["energy"],
                        "confidence": classification["confidence"],
                    }
                )

            else:
                # This song has not been cached before.
                tags = [mood_tag]

                classification = calculate_song_mood(tags)

                # Create a new cache entry.
                track_moods_by_key[cache_key] = TrackMoodResponse(
                    artist=tag.artist,
                    title=tag.title,
                    tags=tags,
                    estimated_mood=classification["mood"],
                    valence=classification["valence"],
                    energy=classification["energy"],
                    confidence=classification["confidence"],
                    source="community",
                    cached=False,
                    fetched_at=datetime.now(timezone.utc),
                )

    return {"status": "saved", "user_id": user_id, "cache_key": cache_key}

@app.get("/users/{user_id}/mood-trends")
def get_mood_trends(user_id: str):
    """
    Calculate daily, weekly, and monthly listening moods.

    Uses:
      listening_events: which songs the user played
      track_moods: each song's classified valence and energy

    Returns all three periods in one API response.
    """

    if not supabase_is_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase is required for mood trends."
        )

    now = datetime.now(timezone.utc)
    month_start = now - timedelta(days=30)

    try:
        # Get listening events from the last 30 days.
        events_result = (
            supabase_client.table("listening_events")
            .select("track_id,artist,title,played_at")
            .eq("user_id", user_id)
            .gte("played_at", month_start.isoformat())
            .order("played_at", desc=True)
            .limit(1000)
            .execute()
        )

        events = events_result.data or []

        # Get cached song classifications.
        # For a hackathon-sized cache this is sufficient.
        moods_result = (
            supabase_client.table("track_moods")
            .select("cache_key,valence,energy")
            .limit(1000)
            .execute()
        )

        moods = {
            row["cache_key"]: row
            for row in (moods_result.data or [])
        }

    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail=f"Could not load listening trends: {error}"
        ) from error

    periods = {
        "daily": timedelta(days=1),
        "weekly": timedelta(days=7),
        "monthly": timedelta(days=30)
    }

    results = {}

    for period, duration in periods.items():
        cutoff = now - duration

        period_events = [
            event for event in events
            if datetime.fromisoformat(
                event["played_at"].replace("Z", "+00:00")
            ) >= cutoff
        ]

        valences = []
        energies = []
        artists = []

        for event in period_events:
            artists.append(event["artist"])

            key = make_track_key(
                event["artist"],
                event["title"]
            )

            classification = moods.get(key)

            if not classification:
                continue

            if classification["valence"] is not None:
                valences.append(classification["valence"])

            if classification["energy"] is not None:
                energies.append(classification["energy"])

        # No classified songs means no score.
        if not valences:
            results[period] = {
                "score": None,
                "average_valence": None,
                "average_energy": None,
                "songs_analyzed": 0,
                "total_plays": len(period_events),
                "top_artist": (
                    Counter(artists).most_common(1)[0][0]
                    if artists else None
                )
            }
            continue

        average_valence = mean(valences)

        # Convert -1..1 valence to a 0..100 score.
        score = round((average_valence + 1) * 50)

        results[period] = {
            "score": max(0, min(100, score)),
            "average_valence": round(average_valence, 3),
            "average_energy": (
                round(mean(energies), 3)
                if energies else None
            ),
            "songs_analyzed": len(valences),
            "total_plays": len(period_events),
            "top_artist": (
                Counter(artists).most_common(1)[0][0]
                if artists else None
            )
        }

    return {
        "user_id": user_id,
        "periods": results,
        "updated_at": now.isoformat()
    }


# ============================================================
# LISTENING HISTORY STATISTICS
# ============================================================
#
# Returns the user's most-played song and artist
# from the last 30 days.
#
# Uses listening_events already stored in Supabase.
# Does not make additional Spotify API requests.
# ============================================================

@app.get("/users/{user_id}/listening-stats")
def get_listening_stats(user_id: str):

    # Require Supabase for listening history.
    if not supabase_is_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase is required for listening history."
        )

    # Use the same rolling 30-day period as Mood Trends.
    month_start = datetime.now(timezone.utc) - timedelta(days=30)

    try:
        # Retrieve the user's recent listening events.
        response = (
            supabase_client.table("listening_events")
            .select("track_id,title,artist,album_art_url")
            .eq("user_id", user_id)
            .gte("played_at", month_start.isoformat())
            .order("played_at", desc=True)
            .limit(1000)
            .execute()
        )

        events = response.data or []

    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail=f"Could not load listening history: {error}"
        ) from error

    # No history yet: return an empty result.
    if not events:
        return {
            "total_plays": 0,
            "top_artist": None,
            "top_song": None
        }

    # Count how many times each artist appears.
    artist_counts = Counter(
        event["artist"]
        for event in events
    )

    # Count plays for each unique Spotify track.
    song_counts = Counter(
        event["track_id"]
        for event in events
    )

    # Find the most-played artist.
    top_artist, artist_plays = (
        artist_counts.most_common(1)[0]
    )

    # Find the most-played Spotify track.
    top_track_id, song_plays = (
        song_counts.most_common(1)[0]
    )

    # Retrieve the song's title, artist, and artwork.
    top_song_event = next(
        event for event in events
        if event["track_id"] == top_track_id
    )

    return {
        "total_plays": len(events),

        "top_artist": {
            "name": top_artist,
            "plays": artist_plays
        },

        "top_song": {
            "title": top_song_event["title"],
            "artist": top_song_event["artist"],
            "plays": song_plays,
            "album_art_url": top_song_event.get(
                "album_art_url"
            )
        }
    }
