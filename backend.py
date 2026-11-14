# Standard-library tools used for timestamps, averages, and type hints.
from datetime import datetime, timezone
from statistics import mean
from typing import List, Optional

# FastAPI creates the web server and HTTPException lets us return clear errors.
from fastapi import FastAPI, HTTPException
# Pydantic validates incoming JSON and converts it into Python objects.
from pydantic import AliasChoices, BaseModel, ConfigDict, Field


# This object is the FastAPI application that Uvicorn runs.
app = FastAPI(title="Moon Trend Backend", version="0.1.0")


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
    valence: Optional[float] = Field(default=None, ge=0, le=1)
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


# Temporary in-memory stores.
# These reset whenever the server restarts. Supabase can replace them later
# without changing the public endpoint structure.
events_by_user: dict[str, list[ListeningEvent]] = {}
current_track_by_user: dict[str, CurrentTrack] = {}


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

    for event in events:
        # Apply the URL user_id to every submitted event before storing it.
        event.user_id = user_id
        events_by_user.setdefault(user_id, []).append(event)

    return {"events_received": len(events)}


@app.post("/users/{user_id}/now-playing", status_code=200)
def update_now_playing(user_id: str, track: CurrentTrack) -> dict[str, str]:
    """Save or replace the user's currently playing track."""
    current_track_by_user[user_id] = track
    return {"status": "updated", "user_id": user_id}


@app.get("/users/{user_id}/now-playing", response_model=CurrentTrack)
def get_now_playing(user_id: str) -> CurrentTrack:
    """Return the user's current track, if one has been submitted."""
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
    user_events = events_by_user.get(user_id, [])
    if not user_events:
        raise HTTPException(status_code=404, detail="No listening events found")
    return calculate_trend(user_events)
