
/**
 * L.U.M.A. LISTENING HISTORY CONTROLLER
 * =====================================
 *
 * Displays the authenticated Spotify user's:
 * - Average monthly listening mood
 * - Most-played song in the last 30 days
 * - Most-played artist in the last 30 days
 *
 * Data comes from FastAPI and Supabase.
 * This file does not request Spotify playback directly.
 */

import {
    isSpotifyConnected,
    getSpotifyUser
} from "./spotify-api.js";

import {
    setBackendUser,
    getListeningStats,
    getMoodTrends,
    getTrackMood
} from "./backend-api.js";


// ==============================================
// HTML ELEMENT REFERENCES
// ==============================================

const elements = {
    average: document.getElementById("history-average"),
    moodHeading: document.getElementById("history-mood-heading"),

    songTitle: document.getElementById("history-song-title"),
    songArtist: document.getElementById("history-song-artist"),
    songMood: document.getElementById("history-song-mood"),
    songPlays: document.getElementById("history-song-plays"),
    albumArt: document.getElementById("history-album-art"),

    topArtist: document.getElementById("history-top-artist"),
    artistDetails: document.getElementById("history-artist-details")
};


// ==============================================
// MOOD DESCRIPTIONS
// ==============================================

function getMoodDescription(score) {
    if (score >= 80) return "Upbeat and Groovy!";
    if (score >= 60) return "Feeling the Rhythm!";
    if (score >= 40) return "A Mellow, Low-Key Mood";
    if (score >= 20) return "A Quiet, Reflective Phase";

    return "Taking Things Slowly";
}


// ==============================================
// DISPLAY MONTHLY MOOD
// ==============================================

function displayMonthlyMood(monthly) {

    if (!monthly || monthly.score === null) {
        elements.average.textContent = "— / 100";
        elements.moodHeading.textContent =
            "Not enough listening data yet";
        return;
    }

    elements.average.textContent = `${monthly.score} / 100`;

    elements.moodHeading.textContent =
        getMoodDescription(monthly.score);
}


// ==============================================
// DISPLAY MOST-PLAYED SONG
// ==============================================

function displayTopSong(song) {

    if (!song) {
        elements.songTitle.textContent = "No songs recorded yet";
        elements.songArtist.textContent =
            "Listen to music on Spotify to build your history.";
        elements.songMood.textContent = "Mood: —";
        elements.songPlays.textContent = "Plays: —";
        elements.albumArt.textContent = "♫";
        return;
    }

    elements.songTitle.textContent = song.title;
    elements.songArtist.textContent = song.artist;
    elements.songPlays.textContent =
        `Plays: ${song.plays}`;

    // Display Spotify artwork if available.
    if (song.album_art_url) {

        const image = document.createElement("img");

        image.src = song.album_art_url;
        image.alt = `Album artwork for ${song.title}`;
        image.loading = "lazy";

        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = "cover";

        elements.albumArt.replaceChildren(image);

    } else {
        elements.albumArt.textContent = "♫";
    }
}


// ==============================================
// DISPLAY MOST-PLAYED ARTIST
// ==============================================

function displayTopArtist(artist) {

    if (!artist) {
        elements.topArtist.textContent =
            "No artist history yet";
        elements.artistDetails.textContent =
            "Your most-played artist will appear here.";
        return;
    }

    elements.topArtist.textContent = artist.name;

    elements.artistDetails.textContent =
        `${artist.plays} recorded plays this month`;
}


// ==============================================
// LOAD TOP SONG MOOD
// ==============================================

async function loadTopSongMood(song) {

    if (!song) return;

    elements.songMood.textContent = "Mood: Loading...";

    try {
        const mood = await getTrackMood(
            song.artist,
            song.title
        );

        const label = mood.estimated_mood;

        elements.songMood.textContent =
            `Mood: ${label && label !== "unknown"
                ? label
                : "Unavailable"}`;

    } catch (error) {
        console.error("Could not load top song mood:", error);
        elements.songMood.textContent = "Mood: Unavailable";
    }
}


// ==============================================
// LOAD LISTENING HISTORY
// ==============================================

async function loadListeningHistory() {

    try {

        // Retrieve statistics and monthly mood together.
        const [stats, trends] = await Promise.all([
            getListeningStats(),
            getMoodTrends()
        ]);

        // Update monthly mood.
        displayMonthlyMood(trends.periods?.monthly);

        // Update favourite song and artist.
        displayTopSong(stats.top_song);
        displayTopArtist(stats.top_artist);

        // Retrieve classification for the most-played song.
        await loadTopSongMood(stats.top_song);

    } catch (error) {

        console.error(
            "Could not load listening history:",
            error
        );

        elements.moodHeading.textContent =
            "Could not load listening history";
        elements.songTitle.textContent =
            "Listening history unavailable";
        elements.artistDetails.textContent =
            "Please try again later.";
    }
}


// ==============================================
// INITIALIZE PAGE
// ==============================================

async function initializeListeningHistory() {

    if (!isSpotifyConnected()) {
        elements.moodHeading.textContent =
            "Connect Spotify to see your listening history";
        return;
    }

    try {

        // Identify the actual Spotify account.
        const spotifyUser = await getSpotifyUser();

        // Initialize user-specific backend requests.
        setBackendUser(spotifyUser.id);

        // Load this user's statistics.
        await loadListeningHistory();

    } catch (error) {

        console.error(
            "Could not initialize listening history:",
            error
        );

        elements.moodHeading.textContent =
            "Could not connect to Spotify";
    }
}

void initializeListeningHistory();
