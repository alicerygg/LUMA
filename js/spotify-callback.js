import { handleCallback } from "./spotify-api.js";

const output = document.getElementById("output");

async function initializeCallback() {
    try {
        output.textContent = "Connecting to Spotify...";

        await handleCallback();

        // Redirect back to LUMA after successful authentication.
        window.location.replace("./index.html");

    } catch (error) {
        console.error("Spotify authentication failed:", error);

        output.textContent =
            `Spotify connection failed: ${error.message}`;
    }
}

initializeCallback();