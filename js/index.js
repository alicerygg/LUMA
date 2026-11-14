
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
    getCurrentSong,
    getSpotifyUser
} from "./spotify-api.js";

import {
    onSongChanged,
    onPlaybackUpdated,
    onMoodUpdated,
    startSongMonitoring,
    stopSongMonitoring,
    onListeningEvent,
    startHistoryMonitoring,
    stopHistoryMonitoring
} from "./spotify-monitor.js";

import {
    saveCurrentTrack,
    saveMoodTag,
    saveHistoryEvent,
    setBackendUser,
    clearBackendUser
} from "./backend-api.js";

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
  mood: document.getElementById("song-mood"),
  moodName: document.querySelector(".mood-name"),
  moodColor: document.querySelector(".mood-color"),
  moodEnergy: document.querySelector(".energy"),
  moodDescription: document.querySelector(".mood-description"),
  moodPrompt: document.getElementById("mood-tag-prompt"),
  moodInput: document.getElementById("custom-mood-input"),
  moodSave: document.getElementById("save-mood-tag"),
  moodMessage: document.getElementById("mood-tag-message")

};

/*
=================================================
CLOSE MENU AFTER NAVIGATION
=================================================

When a user clicks a navigation link,
automatically close the dropdown.
*/

const menuToggle = document.getElementById("menu-toggle");

const navigationLinks = document.querySelectorAll(
  ".main-navigation a"
);

navigationLinks.forEach(link => {

  link.addEventListener("click", () => {

    // Uncheck the checkbox, which hides the menu.
    menuToggle.checked = false;

  });

});


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


/**
 * Ask FastAPI for the cached Last.fm mood when a new song starts.
 * This listens for song changes instead of every playback update so we do
 * not ask Last.fm repeatedly while the same song is playing.
 */
function updateSongMood(song, mood = null, error = null) {

  if (!song) {
    currentMoodTrackKey = null;
    showMoodPrompt(false);
    elements.mood.textContent = "◌ Mood unavailable";
    elements.moodName.textContent = "Mood unavailable";
    elements.moodColor.textContent = "No mood data yet";
    elements.moodEnergy.textContent = "Waiting for a song";
    elements.moodDescription.textContent = "Start listening to see an estimated music mood.";
    return;
  }

  try {
    if (error || !mood) {
        throw error || new Error("Mood classification unavailable");
    }

    const label = mood.estimated_mood ?? "Mood unavailable";
    currentMoodTrackKey = moodStorageKey(song);
    currentMoodArtist = song.artist;
    currentMoodTitle = song.title;
    const savedMood = localStorage.getItem(currentMoodTrackKey);

    if (!mood.tags.length && savedMood) {
      elements.mood.textContent = `◌ ${savedMood}`;
      elements.moodName.textContent = savedMood;
      elements.moodColor.textContent = "Community mood tag";
      elements.moodEnergy.textContent = "Shared by a listener";
      elements.moodDescription.textContent = "This mood tag is shared with L.U.M.A. listeners.";
      showMoodPrompt(false);
      return;
    }

    elements.mood.textContent = `◌ ${label}`;
    elements.moodName.textContent = label;
    elements.moodColor.textContent = mood.tags.length
      ? `Last.fm tags: ${mood.tags.slice(0, 3).join(", ")}`
      : "No Last.fm tags found";
    elements.moodEnergy.textContent = "Estimated from community music tags";
    elements.moodDescription.textContent =
      "This is an estimated music mood based on Last.fm community tags.";
    showMoodPrompt(!mood.tags.length);

  } catch (error) {
    console.error("Could not load Last.fm mood:", error);
    elements.mood.textContent = "◌ Mood unavailable";
    elements.moodName.textContent = "Mood unavailable";
    elements.moodColor.textContent = "Last.fm mood unavailable";
    elements.moodEnergy.textContent = "Try again with another song";
    elements.moodDescription.textContent = "We could not retrieve mood tags for this song.";
    showMoodPrompt(false);
  }
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
let currentMoodTrackKey = null;
let currentMoodArtist = null;
let currentMoodTitle = null;


function moodStorageKey(song) {
  return `luma-mood:${song.artist}:${song.title}`.toLowerCase();
}


function showMoodPrompt(show) {
  elements.moodPrompt.hidden = !show;
  if (!show) {
    elements.moodInput.value = "";
    elements.moodMessage.textContent = "";
  }
}


async function saveUserMoodTag() {
  const tag = elements.moodInput.value.trim();
  if (!tag || !currentMoodTrackKey) {
    elements.moodMessage.textContent = "Enter a mood first.";
    return;
  }

  try {
    await saveMoodTag(currentMoodArtist, currentMoodTitle, tag);
    localStorage.setItem(currentMoodTrackKey, tag);
  } catch (error) {
    console.error("Could not save mood tag:", error);
    elements.moodMessage.textContent = "Could not save this tag. Try again.";
    return;
  }
  elements.mood.textContent = `◌ ${tag}`;
  elements.moodName.textContent = tag;
  elements.moodColor.textContent = "Community mood tag";
  elements.moodEnergy.textContent = "Shared by a listener";
  elements.moodDescription.textContent = "This mood tag is shared with L.U.M.A. listeners.";
  showMoodPrompt(false);
}


/**
 * Start the Spotify homepage.
 *
 * Called when the page loads and a Spotify
 * connection already exists.
 */
async function connectHomepage() {
  // Identify the actual Spotify account.
    const spotifyUser = await getSpotifyUser();

    // Configure backend requests for this user.
    setBackendUser(spotifyUser.id);

    console.log("Connected Spotify user:", spotifyUser.id);

    // Update the interface immediately.
    spotifyConnected = true;
    updateConnectionStatus(true);

    // Register our callback BEFORE starting monitoring.
    // Otherwise we could miss the first song update.
    onPlaybackUpdated((song) => {

        updateSongDisplay(song);

        if (!song) {
            updateSongMood(null);
        }

    });

    // Run once when a different song starts. This saves the song and asks
    // FastAPI for its cached or newly fetched Last.fm mood.
    // When Spotify detects a different song:
    onSongChanged((song) => {

        // Save the currently playing song.
        void saveCurrentTrack(song).catch((error) => {
            console.error("Could not save current track:", error);
        });

        // Clear the previous mood while the new one loads.
        elements.mood.textContent = "◌ Analyzing mood...";
        elements.moodName.textContent = "Analyzing mood...";
        elements.moodColor.textContent = "Checking music tags";
        elements.moodEnergy.textContent = "Please wait";
        elements.moodDescription.textContent =
            "L.U.M.A. is estimating the mood of this song.";

        showMoodPrompt(false);
    });

    // Receive the classification from spotify-monitor.js.
    // This does NOT make another API request.
    onMoodUpdated(({ song, mood, error }) => {
        updateSongMood(song, mood, error);
    });

    // Store confirmed Spotify listening-history events.
    // Do not store songChanged events as listening history.
    onListeningEvent((event) => {

        const { isInitialImport, ...historyEvent } = event;

        void saveHistoryEvent(historyEvent).catch(error => {
            console.error(
                "Could not save listening event:",
                error
            );
        });
    });

    // Start checking Spotify every 10 seconds.
    startSongMonitoring();
    startHistoryMonitoring();

}


/**
 * Disconnect Spotify from the homepage.
 */
function disconnectHomepage() {

    // Mark the current session as disconnected.
    spotifyConnected = false;

    // Stop future Spotify polling.
    stopSongMonitoring();
    stopHistoryMonitoring();
    clearBackendUser();

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

    elements.moodSave.addEventListener("click", () => void saveUserMoodTag());

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
