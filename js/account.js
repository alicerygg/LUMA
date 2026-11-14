
/*
=================================================
L.U.M.A. ACCOUNT PAGE
=================================================

Responsibilities:
1. Verify the user is authenticated.
2. Load their Supabase profile.
3. Display and update their name.
4. Display their account type.
5. Load and upload profile pictures.
6. Support keyboard-accessible picture editing.
7. Log out of L.U.M.A.

Database operations live in profile.js.
*/

import { requireAuth } from "./auth-guard.js";
import { logOut } from "./auth.js";
import { initializeContacts } from "./account-contacts.js";

import {
  loadProfile,
  updateDisplayName,
  uploadAvatar,
  getAvatarUrl
} from "./profile.js";

// ==============================================
// HTML ELEMENTS
// ==============================================

const profilePicture =
  document.getElementById("profile-picture");

const pictureUpload =
  document.getElementById("profile-picture-upload");

const pictureEdit =
  document.querySelector(".profile-picture-edit");

const nameInput =
  document.getElementById("display-name");

const accountType =
  document.getElementById("account-type");

const profileMessage =
  document.getElementById("profile-message");

const logoutButton =
  document.querySelector(".logout-button");

// ==============================================
// HELPERS
// ==============================================

function showMessage(text) {
  if (profileMessage) {
    profileMessage.textContent = text;
  }
}

function formatAccountType(type) {
  switch (type) {
    case "adult":
      return "Adult account";
    case "teen":
      return "Teen account";
    case "pending":
      return "Complete your profile";
    default:
      return "Account type unavailable";
  }
}

// ==============================================
// INITIALIZE ACCOUNT
// ==============================================

async function initializeAccount() {
  // Stop if the visitor is not authenticated.
  const user = await requireAuth();

  if (!user) return;

  // Start trusted contacts independently of profile loading.
  initializeContacts(user);

  // Load the user's profile from Supabase.
  let profile;

  try {
    profile = await loadProfile(user.id);

    nameInput.value = profile.display_name ?? "";
    nameInput.disabled = false;

    accountType.textContent =
      formatAccountType(profile.account_type);

    // Load the user's saved profile picture.
    if (profile.avatar_path) {
      profilePicture.src =
        await getAvatarUrl(profile.avatar_path);
    }

  } catch (error) {
    console.error("Could not load account:", error);
    showMessage("Could not load your profile.");
    return;
  }

  // ============================================
  // SAVE DISPLAY NAME
  // ============================================

  nameInput.addEventListener("change", async () => {
    const newName = nameInput.value.trim();

    if (!newName) {
      showMessage("Please enter a display name.");
      return;
    }

    nameInput.disabled = true;
    showMessage("Saving name...");

    try {
      await updateDisplayName(user.id, newName);
      showMessage("Display name saved!");
    } catch (error) {
      console.error(error);
      showMessage("Could not save display name.");
    } finally {
      nameInput.disabled = false;
    }
  });

  // ============================================
  // UPLOAD PROFILE PICTURE
  // ============================================

  pictureUpload.addEventListener("change", async () => {
    const file = pictureUpload.files?.[0];

    if (!file) return;

    // Preview immediately before uploading.
    const previewUrl = URL.createObjectURL(file);
    const previousImage = profilePicture.src;

    profilePicture.src = previewUrl;
    pictureUpload.disabled = true;

    showMessage("Uploading profile picture...");

    try {
      // uploadAvatar validates file type and size.
      const path = await uploadAvatar(user.id, file);

      // Replace temporary preview with saved image.
      const signedUrl = await getAvatarUrl(path);
      profilePicture.src = signedUrl;

      showMessage("Profile picture updated!");

    } catch (error) {
      console.error("Avatar upload failed:", error);

      // Restore previous image if upload fails.
      profilePicture.src = previousImage;

      showMessage(`Upload failed: ${error.message}`);

    } finally {
      URL.revokeObjectURL(previewUrl);
      pictureUpload.value = "";
      pictureUpload.disabled = false;
    }
  });

  // ============================================
  // KEYBOARD ACCESSIBILITY
  // ============================================

  pictureEdit?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pictureUpload.click();
    }
  });
}

// ==============================================
// LOGOUT
// ==============================================

// Register independently of profile loading so
// logout still works if the profile query fails.
logoutButton?.addEventListener("click", async (event) => {
  event.preventDefault();

  try {
    await logOut();
  } catch (error) {
    console.error("Logout failed:", error);
    showMessage("Could not log out. Please try again.");
  }
});

// ==============================================
// START
// ==============================================

initializeAccount();
