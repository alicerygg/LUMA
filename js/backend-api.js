/**
 * LUMA BACKEND API MODULE
 * =======================
 * Sends normalized Spotify data to the local FastAPI backend.
 */

/**
 * BACKEND ENVIRONMENT CONFIGURATION
 * =================================
 *
 * Local development:
 *   Uses the Python backend running on port 8000.
 *
 * Deployed website:
 *   Uses the public HTTPS backend.
 *
 * This allows us to test locally and in production
 * without manually changing URLs.
 */

const IS_LOCAL =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

const LOCAL_BACKEND_URL = "http://127.0.0.1:8000";

// Replace this once your Python backend is deployed.
const PRODUCTION_BACKEND_URL =
    "https://luma-q9t8.onrender.com";

const BACKEND_BASE_URL = IS_LOCAL
    ? LOCAL_BACKEND_URL
    : PRODUCTION_BACKEND_URL;

/**
 * The Spotify account currently connected to L.U.M.A.
 *
 * Initialized after Spotify authentication.
 */
let currentUserId = null;

/**
 * Set the active Spotify user.
 */
export function setBackendUser(userId) {
    if (typeof userId !== "string" || !userId.trim()) {
        throw new Error("Invalid Spotify user ID");
    }

    currentUserId = userId;
}

/**
 * Get the active user ID for backend requests.
 */
function requireUserId() {
    if (!currentUserId) {
        throw new Error(
            "Spotify user has not been initialized."
        );
    }

    return encodeURIComponent(currentUserId);
}

/**
 * Clear the active user when disconnecting.
 */
export function clearBackendUser() {
    currentUserId = null;
}

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
    return backendRequest(`/users/${requireUserId()}/now-playing`, {
        method: "POST",
        body: JSON.stringify(track)
    });
}

/** Send one history event to FastAPI. The endpoint accepts an array. */
export function saveHistoryEvent(event) {
    return backendRequest(`/users/${requireUserId()}/events`, {
        method: "POST",
        body: JSON.stringify([event])
    });
}

/** Ask FastAPI for a cached or newly fetched Last.fm mood estimate. */
export function getTrackMood(artist, title) {
    const params = new URLSearchParams({ artist, title });
    return backendRequest(`/tracks/mood?${params.toString()}`);
}

/** Save a private mood tag for the current user and track. */
export function saveMoodTag(artist, title, moodTag) {
    return backendRequest(`/users/${requireUserId()}/mood-tags`, {
        method: "POST",
        body: JSON.stringify({ artist, title, mood_tag: moodTag })
    });
}

/**
 * Get daily, weekly, and monthly mood summaries.
 *
 * The backend calculates the scores using
 * listening history and cached song classifications.
 */
export function getMoodTrends() {
    return backendRequest(
        `/users/${requireUserId()}/mood-trends`
    );
}