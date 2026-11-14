
import { requireAuth } from "./auth-guard.js";
import {
  loadProfile,
  updateDisplayName,
  uploadAvatar,
  getAvatarUrl
} from "./profile.js";

export async function initializeAccountProfile(user) {
  const nameInput = document.getElementById("display-name");
  const typeElement = document.getElementById("account-type");
  const avatarImage = document.getElementById("profile-picture");
  const avatarInput = document.getElementById(
    "profile-picture-upload"
  );
  const message = document.getElementById("profile-message");

  function showMessage(text) {
    if (message) message.textContent = text;
  }

  let profile;

  try {
    profile = await loadProfile(user.id);

    nameInput.value = profile.display_name ?? "";
    nameInput.disabled = false;

    // Account type is read-only.
    const accountTypes = {
      adult: "Adult account",
      teen: "Teen account",
      pending: "Complete your profile"
    };

    typeElement.textContent =
      accountTypes[profile.account_type] ??
      "Account type unavailable";

    // Display the saved avatar, if available.
    if (profile.avatar_path) {
      avatarImage.src = await getAvatarUrl(
        profile.avatar_path
      );
    }

  } catch (error) {
    console.error("Profile loading failed:", error);
    showMessage("Could not load your profile.");
    return;
  }

  // Save the display name when the field changes.
  nameInput.addEventListener("change", async () => {
    nameInput.disabled = true;
    showMessage("Saving name...");

    try {
      await updateDisplayName(user.id, nameInput.value);
      showMessage("Name saved successfully!");
    } catch (error) {
      showMessage(`Could not save name: ${error.message}`);
    } finally {
      nameInput.disabled = false;
    }
  });

  // Upload a new avatar when a file is selected.
  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];

    if (!file) return;

    avatarInput.disabled = true;
    showMessage("Uploading profile picture...");

    try {
      const path = await uploadAvatar(user.id, file);
      avatarImage.src = await getAvatarUrl(path);
      showMessage("Profile picture updated!");
    } catch (error) {
      showMessage(`Upload failed: ${error.message}`);
    } finally {
      avatarInput.value = "";
      avatarInput.disabled = false;
    }
  });
}

// Only initialize after confirming authentication.
export async function startAccountProfile() {
  const user = await requireAuth();

  if (!user) return;

  await initializeAccountProfile(user);
}
