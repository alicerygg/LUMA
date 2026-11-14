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

// Optional chaining (?.) makes this safe on callback.html, which has no buttons.
document.getElementById("login")?.addEventListener("click", () => run(login));

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
});

// This event is for confirmed, timestamped history entries.
// A real app could send this to Supabase or a classifier.
onListeningEvent(event => {
    console.log(event.isInitialImport ? "Imported history:" : "New history event:", event);
    if (event.explicit) console.log("Explicit content flag:", event.title);
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
