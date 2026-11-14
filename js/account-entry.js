
import { requireAuth } from "./auth-guard.js";
import { initializeAccountProfile } from "./account-profile.js";

const user = await requireAuth();

if (user) {
  await initializeAccountProfile(user);

  // We'll integrate any remaining account.js features here
  // after checking which elements it currently manages.
}
