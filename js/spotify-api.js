/**
 * LUMA SPOTIFY API MODULE
 * =======================
 * This file ONLY talks to Spotify. It never writes HTML or Supabase rows.
 * Other modules import the exported functions at the bottom of each section.
 *
 * NOTE:
 * 1. This uses sessionStorage. It is NOT a production token vault.
 */

const CLIENT_ID = "127cd68f8e0a437a9f2ac81b8e68c0a5";
const REDIRECT_URI = "http://127.0.0.1:5500/callback.html";

// Spotify permissions: current playback and recently played tracks.
const SCOPES = ["user-read-currently-playing", "user-read-recently-played"];

// All callers share one refresh operation if several requests expire together.
let refreshPromise = null;

/** Generate a random string for PKCE and OAuth state.
 * PKCE proves that the app redeeming the code initiated the login.
 * State protects against a callback from an unrelated login attempt.
 */
function randomString(length) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes); // Cryptographically secure random bytes.
    return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

/** Spotify expects a URL-safe Base64-encoded SHA-256 hash of the verifier. */
async function codeChallenge(verifier) {
    const bytes = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Save token information for the current browser tab/session.
 * Refresh responses may omit refresh_token: retain the old one in that case.
 * expires_in is measured in SECONDS, Date.now() in MILLISECONDS.
 */
function saveTokens(data) {
    sessionStorage.setItem("spotify_access_token", data.access_token);
    if (data.refresh_token) {
        sessionStorage.setItem("spotify_refresh_token", data.refresh_token);
    }
    sessionStorage.setItem("spotify_expires_at", String(Date.now() + data.expires_in * 1000));
}

/** A quick UI hint, NOT proof the token is currently valid. */
export function isSpotifyConnected() {
    return Boolean(sessionStorage.getItem("spotify_access_token") ||
        sessionStorage.getItem("spotify_refresh_token"));
}

/** Called when the user clicks "Connect Spotify".
 * Stores verifier/state before leaving our page for Spotify's consent screen.
 */
export async function login() {
    const verifier = randomString(64);
    const state = randomString(32);
    sessionStorage.setItem("spotify_verifier", verifier);
    sessionStorage.setItem("spotify_state", state);
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: SCOPES.join(" "),
        code_challenge_method: "S256",
        code_challenge: await codeChallenge(verifier),
        state
    });
    window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

/** Called ONLY on callback.html after Spotify redirects the browser.
 * Exchanges the short-lived authorization code for access/refresh tokens.
 * Throws errors for the test page (or frontend) to display.
 */
export async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    if (params.has("error")) throw new Error(`Spotify authorization: ${params.get("error")}`);
    const code = params.get("code");
    if (!code) throw new Error("Missing Spotify authorization code");
    const expectedState = sessionStorage.getItem("spotify_state");
    if (!expectedState || params.get("state") !== expectedState) {
        throw new Error("Spotify OAuth state mismatch");
    }
    const verifier = sessionStorage.getItem("spotify_verifier");
    if (!verifier) throw new Error("Missing PKCE verifier; restart login");

    const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier
        })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Spotify token exchange failed (${response.status})`);
    saveTokens(data);
    sessionStorage.removeItem("spotify_verifier");
    sessionStorage.removeItem("spotify_state");
    return true;
}

/** Use a refresh token to obtain another access token.
 * The shared promise prevents simultaneous refreshes from racing each other.
 */
async function refreshAccessToken() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
        const refreshToken = sessionStorage.getItem("spotify_refresh_token");
        if (!refreshToken) throw new Error("Spotify session expired; connect again");
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
                client_id: CLIENT_ID
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(`Spotify token refresh failed (${response.status})`);
        saveTokens(data);
        return data.access_token;
    })();
    try { return await refreshPromise; }
    finally { refreshPromise = null; }
}

/** Refresh one minute early to avoid a token expiring mid-request. */
async function validAccessToken() {
    const token = sessionStorage.getItem("spotify_access_token");
    const expiry = Number(sessionStorage.getItem("spotify_expires_at"));
    if (!token || !expiry || Date.now() >= expiry - 60_000) {
        return refreshAccessToken();
    }
    return token;
}

/** Shared authenticated GET helper.
 * Returns parsed JSON; returns null on 204 (nothing currently playing).
 * Retries ONCE on 401 after refreshing. Other errors propagate to caller.
 * A production version should also back off on HTTP 429 / Retry-After.
 */
async function spotifyRequest(endpoint) {
    const request = token => fetch(`https://api.spotify.com/v1${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    let response = await request(await validAccessToken());
    if (response.status === 401) response = await request(await refreshAccessToken());
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Spotify API error ${response.status}: ${await response.text()}`);
    return response.json();
}

/** Convert Spotify's nested track object to the simple LUMA contract.
 * All teammates should use these exact property names.
 * Explicit is Spotify's own content flag; it is not a mood classification.
 */
export function formatSpotifyTrack(track) {
    return {
        id: track.id,
        title: track.name,
        artist: track.artists.map(artist => artist.name).join(", "),
        album: track.album?.name ?? null,
        albumArt: track.album?.images?.[0]?.url ?? null,
        spotifyUrl: track.external_urls?.spotify ?? null,
        explicit: Boolean(track.explicit)
    };
}

/** A playback event is a track PLUS the timestamp of that particular play.
 * Two plays of the same track get distinct eventIds if timestamps differ.
 * For multi-user storage, uniqueness must also include the Spotify user ID.
 */
export function formatListeningEvent(entry) {
    const track = formatSpotifyTrack(entry.track);
    return {
        ...track,
        eventId: `${track.id}_${entry.played_at}`,
        playedAt: entry.played_at
    };
}

/** Returns a current song object or null; never touches the page.
 * isPlaying distinguishes paused from actively playing.
 * progressMs can help the UI render a playback progress bar.
 */
export async function getCurrentSong() {
    const data = await spotifyRequest("/me/player/currently-playing");
    if (!data?.item || data.item.type !== "track") return null;
    return {
        ...formatSpotifyTrack(data.item),
        isPlaying: Boolean(data.is_playing),
        progressMs: data.progress_ms ?? null
    };
}

/** Returns newest-first listening events (up to 50 per request).
 * The Spotify endpoint is a limited recent-history window, not a full archive.
 */
export async function getListeningHistory(limit = 20) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 20;
    const data = await spotifyRequest(`/me/player/recently-played?limit=${safeLimit}`);
    return (data?.items ?? []).map(formatListeningEvent);
}
