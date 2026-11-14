
import {
    signUp,
    logIn,
    getCurrentUser
} from "./auth.js";

const form = document.getElementById("auth-form");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const submitButton = document.getElementById("auth-submit");
const message = document.getElementById("auth-message");
const loginTab = document.getElementById("login-tab");
const signupTab = document.getElementById("signup-tab");
const signupFields =
    document.getElementById("signup-fields");

const nameInput =
    document.getElementById("signup-name");

const birthdayInput =
    document.getElementById("signup-birthday");

let mode = "login";

// Switch between login and signup modes.
function setMode(newMode) {
    mode = newMode;

    const signingUp = mode === "signup";

    submitButton.textContent =
        signingUp ? "Create account" : "Log in";

    passwordInput.autocomplete =
        signingUp ? "new-password" : "current-password";

    loginTab.setAttribute("aria-pressed", String(!signingUp));
    signupTab.setAttribute("aria-pressed", String(signingUp));

    message.textContent = "";
    signupFields.hidden = !signingUp;

    nameInput.required = signingUp;
    birthdayInput.required = signingUp;
}

loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));

// Handle form submission.
form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    submitButton.disabled = true;
    message.textContent = "Please wait...";

    try {
        if (mode === "signup") {
            const data = await signUp(
                email,
                password,
                nameInput.value.trim(),
                birthdayInput.value
            );

            if (data.session) {
                window.location.replace("dashboard.html");
                return;
            }

            message.textContent =
                "Check your email for a confirmation link.";
            form.reset();

        } else {
            await logIn(email, password);
            window.location.replace("dashboard.html");
        }

    } catch (error) {
        message.textContent = error.message;
    } finally {
        submitButton.disabled = false;
    }
});

// Returning users can skip the login screen.
async function checkExistingLogin() {
    try {
        const user = await getCurrentUser();

        if (user) {
            window.location.replace("dashboard.html");
        }
    } catch (error) {
        console.error("Authentication check failed:", error);
    }
}

checkExistingLogin();
