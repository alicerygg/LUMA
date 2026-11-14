/**
 * LUMA BACKEND API MODULE
 * =======================
 * Sends normalized Spotify data to the local FastAPI backend.
 */

const BACKEND_BASE_URL = "http://127.0.0.1:8000";

// Temporary test user. Replace this with the authenticated user's ID later.
const USER_ID = "alice";

async function backendRequest(path, options = {}) {
    const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers ?? {})
        }
    });

    if (!response.ok) {
        throw new Error(`Backend request failed (${response.status}): ${await response.text()}`);
    }

    return response.json();
}

/** Send the user's currently playing track to FastAPI. */
export function saveCurrentTrack(track) {
    return backendRequest(`/users/${encodeURIComponent(USER_ID)}/now-playing`, {
        method: "POST",
        body: JSON.stringify(track)
    });
}

/** Send one history event to FastAPI. The endpoint accepts an array. */
export function saveHistoryEvent(event) {
    return backendRequest(`/users/${encodeURIComponent(USER_ID)}/events`, {
        method: "POST",
        body: JSON.stringify([event])
    });
}

/** Ask FastAPI for a cached or newly fetched Last.fm mood estimate. */
export function getTrackMood(artist, title) {
    const params = new URLSearchParams({ artist, title });
    return backendRequest(`/tracks/mood?${params.toString()}`);
}

