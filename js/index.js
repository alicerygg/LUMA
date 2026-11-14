
/*
========================================================
LUMA - HOMEPAGE CONTROLLER
File: index.js
========================================================

PURPOSE:
Connect the LUMA homepage to Spotify.

RESPONSIBILITIES:
1. Update the currently playing song.
2. Display album artwork.
3. Display playback progress.
4. Display Spotify connection status.
5. Handle the Spotify connection button.

This file should NOT make raw Spotify API requests.

Instead, it should use the existing functions from
spotify-api.js and spotify-monitor.js.

========================================================
*/


// =====================================================
// SECTION 1 - HTML ELEMENT REFERENCES
// =====================================================

/*
Rather than repeatedly searching the HTML for elements,
we store references to them in one object.

For example:

elements.title.textContent = "Space Song";

This makes the rest of the code cleaner.
*/

import {
    login,
    disconnectSpotify,
    isSpotifyConnected,
    getCurrentSong
} from "./spotify-api.js";

import {
    onPlaybackUpdated,
    startSongMonitoring,
    stopSongMonitoring
} from "./spotify-monitor.js";

const elements = {

  // Spotify connection UI
  loginButton: document.getElementById("spotify-login-button"),
  connectionStatus: document.getElementById("spotify-connection-status"),

  // Song information
  title: document.getElementById("song-title"),
  artist: document.getElementById("song-artist"),
  album: document.getElementById("song-album"),
  albumArt: document.getElementById("album-art-image"),

  // Playback information
  playbackStatus: document.getElementById("playback-status"),
  progressBar: document.getElementById("song-progress"),
  currentTime: document.getElementById("song-current-time"),
  duration: document.getElementById("song-duration"),

  // Mood information
  mood: document.getElementById("song-mood")

};


// =====================================================
// SECTION 2 - HELPER FUNCTIONS
// =====================================================

/*
Convert milliseconds into a readable timestamp.

Spotify returns time values in milliseconds.

For example:
138000 milliseconds = 2 minutes, 18 seconds.

This function converts:
138000 -> "2:18"
*/

function formatTime(milliseconds) {

  const totalSeconds = Math.floor(milliseconds / 1000);

  const minutes = Math.floor(totalSeconds / 60);

  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;

}


// =====================================================
// SECTION 3 - UPDATE SONG DISPLAY
// =====================================================

/*
This function receives a song object and updates
the homepage.

Expected song object:

{
  title: "Space Song",
  artist: "Beach House",
  album: "Depression Cherry",
  albumArt: "https://...",
  durationMs: 320000,
  progressMs: 138000,
  isPlaying: true
}

IMPORTANT:
This is our own frontend-friendly object format.

We will convert the Spotify API response into this
format in the integration step.
*/

function updateSongDisplay(song) {

  // If no song was provided, display an empty state.
  if (!song) {
    clearSongDisplay();
    return;
  }

  // -----------------------------------------------
  // Update song information
  // -----------------------------------------------

  elements.title.textContent = song.title;

  elements.artist.textContent = song.artist;

  elements.album.textContent = song.album;

  // -----------------------------------------------
  // Update album artwork
  // -----------------------------------------------

  if (song.albumArt) {

    elements.albumArt.src = song.albumArt;

    elements.albumArt.style.display = "block";

  } else {

    elements.albumArt.removeAttribute("src");

    elements.albumArt.style.display = "none";

  }

  // -----------------------------------------------
  // Update playback status
  // -----------------------------------------------

  elements.playbackStatus.textContent =
    song.isPlaying ? "Now playing" : "Paused";

  // -----------------------------------------------
  // Update song progress
  // -----------------------------------------------

  const duration = song.durationMs || 0;

  const progress = song.progressMs || 0;

  // Prevent division by zero.
  const percentage =
    duration > 0
      ? Math.min(100, Math.max(0, (progress / duration) * 100))
      : 0;

  /*
  The CSS progress bar needs to use a width
  percentage to display progress.

  We'll update the CSS shortly.
  */

  elements.progressBar.style.width = `${percentage}%`;

  elements.progressBar.parentElement.setAttribute(
    "aria-valuenow",
    String(Math.round(percentage))
  );

  // Update readable timestamps.
  elements.currentTime.textContent = formatTime(progress);

  elements.duration.textContent = formatTime(duration);

}


// =====================================================
// SECTION 4 - CLEAR SONG DISPLAY
// =====================================================

/*
Called when:
- Spotify is disconnected.
- No playback information is available.
- The user hasn't started listening.

This prevents old song information from remaining
on the homepage.
*/

function clearSongDisplay() {

  elements.title.textContent = "Nothing playing";

  elements.artist.textContent = "Open Spotify to start listening";

  elements.album.textContent = "";

  elements.albumArt.removeAttribute("src");

  elements.albumArt.style.display = "none";

  elements.playbackStatus.textContent = "Not playing";

  elements.progressBar.style.width = "0%";

  elements.progressBar.parentElement.setAttribute("aria-valuenow", "0");

  elements.currentTime.textContent = "0:00";

  elements.duration.textContent = "0:00";

  elements.mood.textContent = "◌ Mood unavailable";

}


// =====================================================
// SECTION 5 - SPOTIFY CONNECTION STATUS
// =====================================================

/*
This updates the login button and connection message.

connected = true:
  Button -> Disconnect Spotify
  Status -> Spotify connected

connected = false:
  Button -> Connect Spotify
  Status -> Spotify not connected
*/

function updateConnectionStatus(connected) {

  if (connected) {

    elements.loginButton.textContent = "Disconnect Spotify";

    elements.connectionStatus.textContent = "Spotify connected";

  } else {

    elements.loginButton.textContent = "Connect Spotify";

    elements.connectionStatus.textContent = "Spotify not connected";

    clearSongDisplay();

  }

}


// =====================================================
// SECTION 8 - EXPORTS
// =====================================================

/*
These functions are available to other modules.

Once we connect the Spotify monitor, it can call
the display functions when the song changes.
*/

export {
  updateSongDisplay,
  clearSongDisplay,
  updateConnectionStatus
};


/*
====================================================
SECTION 7 - HOMEPAGE INITIALIZATION
====================================================

This section connects our HTML buttons and display
functions to the existing Spotify system.
*/

// Tracks whether the current browser session
// has an active Spotify connection.
let spotifyConnected = false;


/**
 * Start the Spotify homepage.
 *
 * Called when the page loads and a Spotify
 * connection already exists.
 */
async function connectHomepage() {

    // Update the interface immediately.
    spotifyConnected = true;
    updateConnectionStatus(true);

    // Register our callback BEFORE starting monitoring.
    // Otherwise we could miss the first song update.
    onPlaybackUpdated((song) => {

        // The Spotify monitor already supplies a
        // formatted LUMA song object.
        updateSongDisplay(song);

    });

    // Start checking Spotify every 10 seconds.
    startSongMonitoring();

}


/**
 * Disconnect Spotify from the homepage.
 */
function disconnectHomepage() {

    // Mark the current session as disconnected.
    spotifyConnected = false;

    // Stop future Spotify polling.
    stopSongMonitoring();

    // Remove saved authentication tokens.
    disconnectSpotify();

    // Update the UI and clear the song display.
    updateConnectionStatus(false);

}


/**
 * Handle clicks on the Spotify connection button.
 */
async function handleSpotifyButtonClick() {

    if (spotifyConnected) {

        // Already connected: disconnect.
        disconnectHomepage();

    } else {

        // Not connected: start Spotify authorization.
        // This redirects the browser to Spotify.
        await login();

    }

}


/**
 * Initialize the homepage when index.js loads.
 */
async function initializeHomepage() {

    // Connect the HTML button to our click handler.
    elements.loginButton.addEventListener(
        "click",
        handleSpotifyButtonClick
    );

    // Check whether tokens already exist in storage.
    if (isSpotifyConnected()) {

        // Reuse the existing Spotify connection.
        await connectHomepage();

    } else {

        // Show the disconnected state.
        updateConnectionStatus(false);

    }

}


// Start everything!
initializeHomepage();