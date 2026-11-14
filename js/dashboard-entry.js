
import { requireAuth } from "./auth-guard.js";
import { verifySpotifyOwner } from "./spotify-api.js";

const user = await requireAuth();

if (user) {
    // Remove Spotify tokens if they belong
    // to a different L.U.M.A. account.
    verifySpotifyOwner(user.id);

    // Start the existing dashboard.
    await import("./index.js");
}
