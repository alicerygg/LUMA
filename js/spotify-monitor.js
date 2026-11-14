/**
 * LUMA SPOTIFY MONITOR
 * ====================
 * This file periodically calls spotify-api.js and announces new information.
 * It does NOT save to Supabase or decide how the UI should look.
 *
 * Two different streams:
 * - songChanged: immediate current-track UI updates (not a confirmed play).
 * - listeningEvent: timestamped Spotify recent-history entries (for storage).
 * Do not insert both streams as listening events or you will double count.
 */
import { getCurrentSong, getListeningHistory } from "./spotify-api.js";

// Notified when a different song starts playing.
const songListeners = new Set();

// Notified on every successful current-playback check.
// Used by the homepage to keep its display synchronized.
const playbackListeners = new Set();

// Notified when new listening-history events are discovered.
const historyListeners = new Set();

const processedEvents = new Set(); // In-memory deduplication; resets on reload.

let songTimer = null;
let historyTimer = null;
let checkingSong = false;
let checkingHistory = false;
let lastTrackId = null;
let historyInitialized = false;

/** Subscribe to current-song changes.
 * Usage: const unsubscribe = onSongChanged(song => updateUI(song));
 * Call unsubscribe() when a screen is destroyed.
 */
export function onSongChanged(callback) {
    songListeners.add(callback);
    return () => songListeners.delete(callback);
}

/**
 * Subscribe to current playback updates.
 *
 * Unlike onSongChanged(), this listener receives updates
 * even when the song itself hasn't changed.
 *
 * This allows the homepage to update:
 * - Song progress
 * - Paused/playing status
 * - Current track information
 *
 * The callback receives a formatted song object,
 * or null when no current track is available.
 *
 * Returns an unsubscribe function.
 */
export function onPlaybackUpdated(callback) {

    playbackListeners.add(callback);

    return () => playbackListeners.delete(callback);

}

/** Subscribe to newly discovered listening-history events.
 * Events from the initial poll are marked isInitialImport=true.
 * They are useful for database backfill, NOT fresh-mood alerts.
 */
export function onListeningEvent(callback) {
    historyListeners.add(callback);
    return () => historyListeners.delete(callback);
}

/** Tell every subscriber about an event.
 * Catch errors per subscriber so a broken UI callback cannot block storage.
 * Async callbacks are NOT awaited: database code should handle failures.
 */
function notify(listeners, payload) {
    for (const callback of listeners) {
        try {
            Promise.resolve(callback(payload)).catch(error => {
                console.error("Spotify subscriber failed:", error);
            });
        } catch (error) {
            console.error("Spotify subscriber failed:", error);
        }
    }
}

/**
 * Check Spotify for the current song.
 *
 * We maintain TWO different notification systems:
 *
 * playbackListeners:
 *   Receive every successful playback snapshot.
 *   Useful for updating the homepage.
 *
 * songListeners:
 *   Only receive events when a different song begins.
 *   Useful for mood classification.
 *
 * These events are NOT confirmed listening-history entries.
 */
async function checkSong() {

    // Prevent overlapping Spotify requests.
    if (checkingSong) return;

    checkingSong = true;

    try {

        // Ask our Spotify API module for the current song.
        const song = await getCurrentSong();

        // Always update playback subscribers.
        // Even if the same song is playing, its progress
        // and playback state may have changed.
        notify(playbackListeners, song);

        // If nothing is actively playing, reset the
        // last-track ID so resuming can trigger an event.
        if (!song?.isPlaying) {

            lastTrackId = null;
            return;

        }

        // Only notify song-change subscribers when
        // the playing track differs from the last one.
        if (song.id !== lastTrackId) {

            lastTrackId = song.id;

            notify(songListeners, song);

        }

    } catch (error) {

        // Keep the monitor alive after a temporary error.
        console.error("Current-song polling failed:", error);

    } finally {

        // Allow the next request to run.
        checkingSong = false;

    }
}

/** Start a 10-second poll. Calling twice will not start duplicate timers. */
export function startSongMonitoring() {
    if (songTimer !== null) return;
    void checkSong(); // Immediately populate the UI.
    songTimer = setInterval(checkSong, 10_000);
}

/** Stop future song checks. Already-running requests may still finish. */
export function stopSongMonitoring() {
    if (songTimer !== null) clearInterval(songTimer);
    songTimer = null;
    lastTrackId = null;
}

/** Poll up to 50 recent events, oldest first.
 * The FIRST successful poll is a historical import, not live activity.
 * Marking the event in the Set avoids re-emitting it in later polls.
 * Caveat: this Set is not durable and a subscriber's failed DB write is
 * not automatically retried. Use database upsert + unique constraints.
 */
async function checkHistory() {
    if (checkingHistory) return;
    checkingHistory = true;
    try {
        const events = (await getListeningHistory(50)).reverse();
        const isInitialImport = !historyInitialized;
        for (const event of events) {
            if (processedEvents.has(event.eventId)) continue;
            processedEvents.add(event.eventId);
            notify(historyListeners, { ...event, isInitialImport });
        }
        historyInitialized = true; // Only after a successful request.
    } catch (error) {
        console.error("Listening-history polling failed:", error);
    } finally {
        checkingHistory = false;
    }
}

/** Start a 30-second history poll. */
export function startHistoryMonitoring() {
    if (historyTimer !== null) return;
    void checkHistory();
    historyTimer = setInterval(checkHistory, 30_000);
}

/** Stop future history checks; keep deduplication state in memory. */
export function stopHistoryMonitoring() {
    if (historyTimer !== null) clearInterval(historyTimer);
    historyTimer = null;
}

/** Convenient for app startup after a successful Spotify login. */
export function startAllMonitoring() {
    startSongMonitoring();
    startHistoryMonitoring();
}

/** Convenient for app shutdown / disconnect. Does not revoke Spotify tokens. */
export function stopAllMonitoring() {
    stopSongMonitoring();
    stopHistoryMonitoring();
}
