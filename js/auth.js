
import { supabase } from "./supabase-client.js";
import { disconnectSpotify } from "./spotify-api.js";

// Register a new L.U.M.A. user.

export async function signUp(
    email,
    password,
    displayName,
    birthday
) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${window.location.origin}/index.html`,

            data: {
                display_name: displayName,
                date_of_birth: birthday
            }
        }
    });

    if (error) throw error;

    return data;
}


// Log in with an existing account.
export async function logIn(email, password) {
    const { data, error } =
        await supabase.auth.signInWithPassword({
            email,
            password
        });

    if (error) throw error;
    return data;
}

// Sign out of L.U.M.A.
export async function logOut() {
    // Removes spotify connection when logging out
    disconnectSpotify()

    // Then end session
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    window.location.replace("index.html");
}

// Retrieve the current session.
// Useful for UI checks; server authorization must
// still be enforced separately.
export async function getSession() {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;
    return data.session;
}

// Retrieve an authenticated user from Supabase.
export async function getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;
    return data.user;
}
