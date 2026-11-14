
/*
=================================================
L.U.M.A. MOOD TRENDS
=================================================

Responsibilities:
1. Switch daily, weekly, and monthly tabs.
2. Display independent content for each period.
3. Update the moon based on a mood score.
4. Display support resources for low scores.
5. Provide a simple interface for future data.
*/

import {
    getMoodTrends,
    setBackendUser
} from "./backend-api.js";

import {
    isSpotifyConnected,
    getSpotifyUser
} from "./spotify-api.js";

const tabs = [...document.querySelectorAll(".period-tab")];
const panels = [...document.querySelectorAll(".trend-panel")];

const LOW_MOOD_THRESHOLD = 40;
let userName = "friend";
let trustedContact = null;

// ==============================================
// DATA PLACEHOLDERS
// ==============================================

// Replace these values when Supabase integration
// becomes available.
//
// A null score means no mood data is available.

const trendData = {
    daily: {
        score: null,
        topArtist: null,
        songsAnalyzed: 0,
        mascotMessage: "Every day is a new phase.",
        quote: "You deserve the same kindness you give to others."
    },

    weekly: {
        score: null,
        topArtist: null,
        songsAnalyzed: 0,
        mascotMessage: "Every week brings a new rhythm.",
        quote: "Progress is not always a straight line."
    },

    monthly: {
        score: null,
        topArtist: null,
        songsAnalyzed: 0,
        mascotMessage: "Every phase of you belongs here.",
        quote: "Growth happens in every season."
    }
};

// ==============================================
// MOOD DESCRIPTIONS
// ==============================================

function getMoodDescription(score) {
    if (score >= 80) {
        return "Upbeat and Groovy!";
    }

    if (score >= 60) {
        return "Feeling the Rhythm!";
    }

    if (score >= 40) {
        return "A Mellow, Low-Key Mood";
    }

    if (score >= 20) {
        return "A Quiet, Reflective Phase";
    }

    return "Taking Things Slowly";
}

// ==============================================
// UPDATE A PANEL
// ==============================================

function renderPeriod(period) {
    const data = trendData[period];
    const panel = document.getElementById(`panel-${period}`);

    if (!panel || !data) return;

    const moon = panel.querySelector('[data-field="moon"]');
    const scoreElement = panel.querySelector('[data-field="score"]');
    const heading = panel.querySelector('[data-field="heading"]');
    const caption = panel.querySelector('[data-field="caption"]');
    const mascotMessage = panel.querySelector(
        '[data-field="mascot-message"]'
    );
    const highlights = panel.querySelector(
        '[data-field="highlights"]'
    );
    const support = panel.querySelector('[data-field="support"]');
    const quote = panel.querySelector('[data-field="quote"]');

    const score = data.score;

    // Find the check-in card in the current panel.
    const checkinCard = panel.querySelector(".mood-checkin");
    const checkinHeading = panel.querySelector(".checkin-heading");

    // Find the trusted contact section.
    const contactSection = panel.querySelector(".trusted-contact");
    const contactName = panel.querySelector(".trusted-contact-name");
    const contactButton = panel.querySelector(".trusted-contact-button");

    // Only show the contact if:
    // 1. The check-in card is visible.
    // 2. A trusted contact with a phone number exists.
    if (!checkinCard.hidden && trustedContact?.phone) {

        contactSection.hidden = false;

        contactName.textContent = trustedContact.name || "Trusted contact";

        contactButton.href = `tel:${trustedContact.phone}`;

    } else {
        contactSection.hidden = true;
    }

    // Replace this with the user's display name.
    // const userName = "friend";

    // Show the card only when a valid score is below low mood threshold.
    checkinCard.hidden = !(Number.isFinite(score) && score < LOW_MOOD_THRESHOLD);

    if (!checkinCard.hidden) {
        checkinHeading.textContent = `Are you okay, ${userName}?`;
    }

    // No data available yet.
    if (score === null || !Number.isFinite(score)) {
        moon.style.setProperty("--phase", "0%");
        scoreElement.textContent = "— / 100";
        heading.textContent = "Your mood is taking shape";
        caption.textContent =
            `Your ${period} listening trends will appear here.`;

        support.hidden = true;
    } else {
        // Clamp the score between 0 and 100.
        const safeScore = Math.max(0, Math.min(100, score));

        moon.style.setProperty("--phase", `${safeScore}%`);
        moon.setAttribute(
            "aria-label",
            `${period} listening mood score: ${safeScore} out of 100`
        );

        scoreElement.textContent = `${safeScore} / 100`;
        heading.textContent = getMoodDescription(safeScore);

        caption.textContent =
            `Based on ${data.songsAnalyzed} classified songs ` +
            `from your ${period} listening activity.`;

        // Low scores display additional support resources.
        support.hidden = safeScore >= LOW_MOOD_THRESHOLD;
    }

    mascotMessage.textContent = data.mascotMessage;
    quote.textContent = `“${data.quote}”`;

    // Update the period's listening highlights.
    highlights.replaceChildren();

    const artistText = document.createElement("p");

    artistText.textContent = data.topArtist
        ? `Top artist: ${data.topArtist}`
        : `Your top artist for this ${period} period will appear here.`;

    highlights.append(artistText);
}

// ==============================================
// TAB SWITCHING
// ==============================================

function activateTab(period, focusTab = false) {
    tabs.forEach((tab) => {
        const active = tab.dataset.period === period;

        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;

        if (active && focusTab) {
            tab.focus();
        }
    });

    panels.forEach((panel) => {
        panel.hidden = panel.dataset.period !== period;
    });

    renderPeriod(period);
}

// Handle mouse clicks.
tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
        activateTab(tab.dataset.period);
    });

    // Support keyboard navigation between tabs.
    tab.addEventListener("keydown", (event) => {
        let nextIndex;

        if (event.key === "ArrowRight") {
            nextIndex = (index + 1) % tabs.length;
        } else if (event.key === "ArrowLeft") {
            nextIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
            nextIndex = 0;
        } else if (event.key === "End") {
            nextIndex = tabs.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        activateTab(tabs[nextIndex].dataset.period, true);
    });
});

// ==============================================
// FUTURE DATABASE INTEGRATION
// ==============================================

/**
 * Update a period with real data.
 *
 * Example:
 *
 * updateTrend("daily", {
 *     score: 78,
 *     topArtist: "Taylor Swift",
 *     mascotMessage: "Looking bright today!"
 * });
 */
export function updateTrend(period, updates) {
    if (!trendData[period]) {
        throw new Error(`Unknown mood period: ${period}`);
    }

    Object.assign(trendData[period], updates);

    renderPeriod(period);
}

/**
 * Load actual mood trends from FastAPI.
 *
 * FastAPI reads listening history and song moods
 * from Supabase, then calculates each period.
 */
async function loadMoodTrends() {

    try {
        const response = await getMoodTrends();

        for (const period of ["daily", "weekly", "monthly"]) {

            const data = response.periods[period];

            if (!data) continue;

            updateTrend(period, {
                // TEST: Force daily mood below 30.
                score: period === "daily" ? 20 : data.score,
                topArtist: data.top_artist,
                songsAnalyzed: data.songs_analyzed
            });
        }

    } catch (error) {

        console.error("Could not load mood trends:", error);

        // Keep the empty states rather than
        // displaying fabricated mood scores.
    }
}

// Initialize all three panels.
Object.keys(trendData).forEach(renderPeriod);

// Show the daily panel first.
activateTab("daily");

async function initializeMoodTrends() {

    if (!isSpotifyConnected()) {
        console.log("Spotify is not connected.");
        return;
    }

    try {
        const spotifyUser = await getSpotifyUser();
        userName = spotifyUser.display_name || "friend";

        setBackendUser(spotifyUser.id);

        await loadMoodTrends();

    } catch (error) {
        console.error(
            "Could not initialize mood trends:",
            error
        );
    }
}

void initializeMoodTrends();