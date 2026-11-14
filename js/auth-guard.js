import { getCurrentUser } from "./auth.js";

// Returns the authenticated user, or redirects to login.
export async function requireAuth() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      window.location.replace("index.html");
      return null;
    }

    return user;

  } catch (error) {
    console.error("Authentication check failed:", error);
    window.location.replace("index.html");
    return null;
  }
}
