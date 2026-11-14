
import {
  getContacts,
  addContact,
  updateContact,
  deleteContact
} from "./contacts.js";

export function initializeContacts(user) {
  const list = document.getElementById("contacts-list");
  const form = document.getElementById("contact-form");
  const message = document.getElementById("contacts-message");
  const heading = document.getElementById("contact-form-heading");
  const saveButton = document.getElementById("contact-save");
  const cancelButton = document.getElementById("contact-cancel");

  const name = document.getElementById("contact-name");
  const email = document.getElementById("contact-email");
  const phone = document.getElementById("contact-phone");
  const channel = document.getElementById("contact-channel");

  let contacts = [];
  let editingId = null;

  function notify(text) {
    message.textContent = text;
  }

  function resetForm() {
    form.reset();
    editingId = null;
    heading.textContent = "Add a contact";
    saveButton.textContent = "Save contact";
    cancelButton.hidden = true;
  }

  function makeButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  function renderContacts() {
    list.replaceChildren();

    if (contacts.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No trusted contacts added yet.";
      list.append(empty);
      return;
    }

    for (const contact of contacts) {
      const card = document.createElement("article");
      card.className = "contact-item";

      const info = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = contact.name;

      const details = document.createElement("p");
      details.textContent = [
        contact.email,
        contact.phone
      ].filter(Boolean).join(" • ");

      info.append(title, details);

      const actions = document.createElement("div");
      actions.className = "contact-actions";

      const enabledLabel = document.createElement("label");
      const enabledCheckbox = document.createElement("input");
      enabledCheckbox.type = "checkbox";
      enabledCheckbox.checked = contact.enabled !== false;

      enabledLabel.append(enabledCheckbox, " Enabled");

      enabledCheckbox.addEventListener("change", async () => {
        enabledCheckbox.disabled = true;
        try {
          await updateContact(user.id, contact.id, {
            enabled: enabledCheckbox.checked
          });
          await refresh();
        } catch (error) {
          enabledCheckbox.checked = !enabledCheckbox.checked;
          notify(`Could not update contact: ${error.message}`);
        } finally {
          enabledCheckbox.disabled = false;
        }
      });

      const editButton = makeButton("Edit", () => {
        editingId = contact.id;
        name.value = contact.name ?? "";
        email.value = contact.email ?? "";
        phone.value = contact.phone ?? "";
        channel.value = contact.preferred_channel ?? "email";
        heading.textContent = "Edit contact";
        saveButton.textContent = "Save changes";
        cancelButton.hidden = false;
        name.focus();
      });

      const deleteButton = makeButton("Delete", async () => {
        if (!confirm(`Delete ${contact.name}?`)) return;

        deleteButton.disabled = true;

        try {
          await deleteContact(user.id, contact.id);
          if (editingId === contact.id) resetForm();
          notify("Contact deleted.");
          await refresh();
        } catch (error) {
          notify(`Could not delete contact: ${error.message}`);
          deleteButton.disabled = false;
        }
      });

      actions.append(enabledLabel, editButton, deleteButton);
      card.append(info, actions);
      list.append(card);
    }
  }

  async function refresh() {
    contacts = await getContacts(user.id);
    renderContacts();
  }

  cancelButton.addEventListener("click", resetForm);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const contact = {
      name: name.value.trim(),
      email: email.value.trim() || null,
      phone: phone.value.trim() || null,
      preferred_channel: channel.value,
      enabled: true
    };

    if (!contact.name) {
      notify("Please enter a contact name.");
      return;
    }

    if (!contact.email && !contact.phone) {
      notify("Enter an email address or phone number.");
      return;
    }

    if (
      (contact.preferred_channel === "email" && !contact.email) ||
      (contact.preferred_channel === "phone" && !contact.phone)
    ) {
      notify("Provide the selected preferred contact method.");
      return;
    }

    saveButton.disabled = true;

    try {
      if (editingId) {
        // Preserve the existing enabled setting.
        delete contact.enabled;
        await updateContact(user.id, editingId, contact);
        notify("Contact updated!");
      } else {
        await addContact(user.id, contact);
        notify("Contact added!");
      }

      resetForm();
      await refresh();

    } catch (error) {
      notify(`Could not save contact: ${error.message}`);
    } finally {
      saveButton.disabled = false;
    }
  });

  refresh().catch((error) => {
    notify(`Could not load contacts: ${error.message}`);
  });
}
