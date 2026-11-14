/*
=================================================
L.U.M.A. SPOTIFY AUTHENTICATION CALLBACK
=================================================

Responsibilities:
1. Verify the user is logged into L.U.M.A.
2. Complete Spotify's OAuth authentication.
3. Associate the Spotify tokens with the L.U.M.A. user.
4. Redirect back to the dashboard.
*/

import { supabase } from "./supabase-client.js";

import {
    handleCallback,
    setSpotifyOwner
} from "./spotify-api.js";

const output = document.getElementById("output");

async function initializeCallback() {
    try {
        output.textContent = "Connecting to Spotify...";

        // ==========================================
        // STEP 1: Verify L.U.M.A. authentication
        // ==========================================

        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
            throw new Error(
                "You must be logged into L.U.M.A. to connect Spotify."
            );
        }

        const user = data.user;

        // ==========================================
        // STEP 2: Complete Spotify authentication
        // ==========================================

        await handleCallback();

        // ==========================================
        // STEP 3: Associate Spotify with L.U.M.A.
        // ==========================================

        setSpotifyOwner(user.id);

        // ==========================================
        // STEP 4: Return to dashboard
        // ==========================================

        window.location.replace("./dashboard.html");

    } catch (error) {
        console.error("Spotify authentication failed:", error);

        output.textContent =
            `Spotify connection failed: ${error.message}`;
    }
}

initializeCallback();
