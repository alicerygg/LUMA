from collections import Counter
from datetime import datetime, timezone
from statistics import mean
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import AliasChoices, BaseModel, ConfigDict, Field


app = FastAPI(title="Moon Trend Backend", version="0.1.0")


class ListeningEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # The API payload uses the friend's field names; the Python names keep the
    # trend calculation readable.
    user_id: str = "default"
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
    user_id: str
    status: str
    headline: str
    summary: str
    reasons: List[str]
    trend_strength: float = Field(ge=0, le=1)
    updated_at: datetime


# Temporary in-memory store. Replace this with Supabase once the teammate
# confirms the final table schema and credentials.
events_by_user: dict[str, list[ListeningEvent]] = {}
current_track_by_user: dict[str, CurrentTrack] = {}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/events", status_code=201)
def add_events(events: List[ListeningEvent]) -> dict[str, int]:
    if not events:
        raise HTTPException(status_code=400, detail="At least one event is required")

    for event in events:
        events_by_user.setdefault(event.user_id, []).append(event)

    return {"events_received": len(events)}


@app.post("/users/{user_id}/events", status_code=201)
def add_user_events(user_id: str, events: List[ListeningEvent]) -> dict[str, int]:
    """Store the friend's payload for a specific user."""
    if not events:
        raise HTTPException(status_code=400, detail="At least one event is required")

    for event in events:
        event.user_id = user_id
        events_by_user.setdefault(user_id, []).append(event)

    return {"events_received": len(events)}


@app.post("/users/{user_id}/now-playing", status_code=200)
def update_now_playing(user_id: str, track: CurrentTrack) -> dict[str, str]:
    current_track_by_user[user_id] = track
    return {"status": "updated", "user_id": user_id}


@app.get("/users/{user_id}/now-playing", response_model=CurrentTrack)
def get_now_playing(user_id: str) -> CurrentTrack:
    track = current_track_by_user.get(user_id)
    if track is None:
        raise HTTPException(status_code=404, detail="No current track found")
    return track


def calculate_trend(user_events: list[ListeningEvent]) -> TrendResponse:
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

    ordered = sorted(user_events, key=lambda event: event.played_at)
    midpoint = len(ordered) // 2
    previous = ordered[:midpoint]
    recent = ordered[midpoint:]
    reasons: list[str] = []
    change_scores: list[float] = []

    previous_minutes = sum(e.duration_seconds for e in previous) / 60
    recent_minutes = sum(e.duration_seconds for e in recent) / 60
    if previous_minutes > 0:
        listening_change = abs(recent_minutes - previous_minutes) / previous_minutes
        if listening_change >= 0.40:
            direction = "higher" if recent_minutes > previous_minutes else "lower"
            reasons.append(f"Listening time is {direction} than your earlier pattern.")
            change_scores.append(min(listening_change, 1.0))

    previous_repeats = 1 - len({e.track_id for e in previous}) / len(previous)
    recent_repeats = 1 - len({e.track_id for e in recent}) / len(recent)
    repeat_change = abs(recent_repeats - previous_repeats)
    if repeat_change >= 0.25:
        reasons.append("Song repetition changed noticeably.")
        change_scores.append(min(repeat_change, 1.0))

    previous_artists = len({e.artist for e in previous}) / len(previous)
    recent_artists = len({e.artist for e in recent}) / len(recent)
    variety_change = abs(recent_artists - previous_artists)
    if variety_change >= 0.25:
        reasons.append("Artist variety changed noticeably.")
        change_scores.append(min(variety_change, 1.0))

    previous_energy = [e.energy for e in previous if e.energy is not None]
    recent_energy = [e.energy for e in recent if e.energy is not None]
    if previous_energy and recent_energy:
        energy_change = abs(mean(recent_energy) - mean(previous_energy))
        if energy_change >= 0.20:
            reasons.append("Average music energy changed noticeably.")
            change_scores.append(min(energy_change, 1.0))

    strength = min(mean(change_scores) if change_scores else 0.0, 1.0)
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
    user_events = events_by_user.get(user_id, [])
    if not user_events:
        raise HTTPException(status_code=404, detail="No listening events found")
    return calculate_trend(user_events)
