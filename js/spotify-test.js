/**
 * LUMA SPOTIFY TEST PAGE
 * ======================
 * This is the ONLY file that knows about our test HTML buttons and <pre>.
 * The production frontend can replace this file without changing the API.
 *
 * HTML IDs expected: login, current, history, output.
 * Both index.html and callback.html load this as a type="module" script.
 */
import {
    login,
    handleCallback,
    isSpotifyConnected,
    getCurrentSong,
    getListeningHistory
} from "./spotify-api.js";
import {
    onSongChanged,
    onListeningEvent,
    startAllMonitoring
} from "./spotify-monitor.js";
import { getTrackMood, saveCurrentTrack, saveHistoryEvent } from "./backend-api.js";

const output = document.getElementById("output");

/** Render a string or object as readable plaintext. */
function display(data) {
    if (!output) return;
    output.textContent = typeof data === "string"
        ? data
        : JSON.stringify(data, null, 2);
}

/** Catch errors from async button handlers and display them. */
async function run(action) {
    try { await action(); }
    catch (error) {
        console.error(error);
        display(`Error: ${error.message}`);
    }
}

/** Update the visible L.U.M.A. cards when Spotify reports a new song. */
async function updateLumaPage(song) {
    document.querySelector(".song-title")?.replaceChildren(song.title);
    document.querySelector(".artist")?.replaceChildren(song.artist);
    document.querySelector(".album")?.replaceChildren(song.album ?? "");

    const albumArt = document.querySelector(".album-art");
    if (albumArt && song.albumArt) {
        albumArt.textContent = "";
        albumArt.style.backgroundImage = `url("${song.albumArt}")`;
        albumArt.style.backgroundSize = "cover";
        albumArt.style.backgroundPosition = "center";
    }

    try {
        const mood = await getTrackMood(song.artist, song.title);
        const moodLabel = mood.estimated_mood ?? "Mood unavailable";

        // The main song card uses #song-mood. The dashboard mood card below
        // uses the class-based selectors, so update both views when present.
        document.querySelector("#song-mood")?.replaceChildren(`Mood: ${moodLabel}`);
        document.querySelector(".mood-name")?.replaceChildren(
            moodLabel
        );
        document.querySelector(".mood-color")?.replaceChildren(
            mood.tags.length ? `Last.fm tags: ${mood.tags.slice(0, 3).join(", ")}` : "No tags found"
        );
        document.querySelector(".energy")?.replaceChildren("Estimated from community music tags");
        document.querySelector(".mood-description")?.replaceChildren(
            "This is an estimated music mood based on Last.fm community tags."
        );
    } catch (error) {
        console.error("Could not load track mood:", error);
    }
}

// Optional chaining (?.) makes this safe on callback.html, which has no buttons.
document.getElementById("login")?.addEventListener("click", () => run(login));
document.getElementById("spotify-login-button")?.addEventListener("click", () => run(login));

document.getElementById("current")?.addEventListener("click", () => run(async () => {
    const song = await getCurrentSong(); // API returns data; test page decides display.
    display(song ?? "No current track detected.");
}));

document.getElementById("history")?.addEventListener("click", () => run(async () => {
    display(await getListeningHistory(20));
}));

// This event updates the test page when the current track changes.
onSongChanged(song => {
    console.log("Current track changed:", song);
    display(song);
    void updateLumaPage(song);
    saveCurrentTrack(song).catch(error => {
        console.error("Could not save current track to backend:", error);
    });
});

// This event is for confirmed, timestamped history entries.
// A real app could send this to Supabase or a classifier.
onListeningEvent(event => {
    console.log(event.isInitialImport ? "Imported history:" : "New history event:", event);
    if (event.explicit) console.log("Explicit content flag:", event.title);
    saveHistoryEvent(event).catch(error => {
        console.error("Could not save history event to backend:", error);
    });
});

// OAuth redirects to callback.html. Only that page exchanges the code.
if (window.location.pathname.endsWith("/callback.html")) {
    run(async () => {
        await handleCallback();
        // Replace rather than push, so Back doesn't reprocess the code.
        window.location.replace("index.html");
    });
} else if (isSpotifyConnected()) {
    // Start monitoring only on the main test page and only after login.
    startAllMonitoring();
} else {
    display("Not connected. Click Connect to Spotify.");
}
