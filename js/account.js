
/*
=================================================
L.U.M.A. ACCOUNT PROFILE PICTURE
=================================================

Allows users to:
1. Select a profile picture from their device.
2. Preview it immediately.
3. Save it locally so it survives page refreshes.

Currently uses localStorage.
Can later be replaced with Supabase Storage.
*/

const profilePicture = document.getElementById("profile-picture");
const pictureUpload = document.getElementById("profile-picture-upload");
const pictureEdit = document.querySelector(".profile-picture-edit");

const STORAGE_KEY = "luma-profile-picture";
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

// Load saved profile picture when page opens.
function loadProfilePicture() {
  try {
    const savedPicture = localStorage.getItem(STORAGE_KEY);

    if (savedPicture) {
      profilePicture.src = savedPicture;
    }
  } catch (error) {
    console.warn("Could not load profile picture:", error);
  }
}

// Handle the user's selected image.
function handleProfilePictureChange(event) {
  const file = event.target.files[0];

  if (!file) return;

  // Only allow supported image formats.
  const allowedTypes = [
    "image/png",
    "image/jpeg",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    alert("Please select a PNG, JPG, or WebP image.");
    pictureUpload.value = "";
    return;
  }

  // Prevent very large files from filling browser storage.
  if (file.size > MAX_FILE_SIZE) {
    alert("Please select an image smaller than 2 MB.");
    pictureUpload.value = "";
    return;
  }

  // Convert the image into a data URL.
  const reader = new FileReader();

  reader.onload = () => {
    const imageData = reader.result;

    // Immediately update the profile picture.
    profilePicture.src = imageData;

    // Save locally for future visits.
    try {
      localStorage.setItem(STORAGE_KEY, imageData);
    } catch (error) {
      console.warn("Could not save profile picture:", error);
      alert("Picture updated, but it may not persist after refresh.");
    }
  };

  reader.onerror = () => {
    alert("Could not read the selected image.");
  };

  reader.readAsDataURL(file);

  // Allow selecting the same file again later.
  pictureUpload.value = "";
}

// Keyboard users can activate the edit label with Enter or Space.
pictureEdit.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    pictureUpload.click();
  }
});

// Listen for changes to the file input.
pictureUpload.addEventListener("change", handleProfilePictureChange);

// Restore saved picture on page load.
loadProfilePicture();
