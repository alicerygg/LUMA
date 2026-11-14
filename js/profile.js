
import { supabase } from "./supabase-client.js";

// Retrieve the profile belonging to a particular user.
export async function loadProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, date_of_birth, account_type, avatar_path"
    )
    .eq("id", userId)
    .single();

  if (error) throw error;

  return data;
}

// Save an updated display name.
export async function updateDisplayName(userId, name) {
  const cleanName = name.trim();

  if (!cleanName || cleanName.length > 80) {
    throw new Error("Enter a name between 1 and 80 characters.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: cleanName })
    .eq("id", userId);

  if (error) throw error;
}

// Retrieve a temporary URL for a private avatar.
export async function getAvatarUrl(path) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, 3600);

  if (error) throw error;

  return data.signedUrl;
}

// Upload a new profile picture.
export async function uploadAvatar(userId, file) {
  const allowedTypes = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp"
  };

  const extension = allowedTypes[file.type];

  if (!extension) {
    throw new Error("Please select a PNG, JPG, or WebP image.");
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Profile pictures must be under 2 MB.");
  }

  // A unique filename avoids stale browser image caches.
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, {
      contentType: file.type,
      upsert: false
    });

  if (uploadError) throw uploadError;

  // Save the file location in the user's profile.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", userId);

  if (profileError) {
    // Clean up the new upload if the database update fails.
    await supabase.storage.from("avatars").remove([path]);
    throw profileError;
  }

  return path;
}
