
import { supabase } from "./supabase-client.js";

// Retrieve contacts belonging to the logged-in user.
export async function getContacts(userId) {
  const { data, error } = await supabase
    .from("trusted_contacts")
    .select("*")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

// Add a new trusted contact.
export async function addContact(userId, contact) {
  const { error } = await supabase
    .from("trusted_contacts")
    .insert({
      owner_user_id: userId,
      ...contact
    });

  if (error) throw error;
}

// Update an existing contact.
export async function updateContact(userId, contactId, changes) {
  const { error } = await supabase
    .from("trusted_contacts")
    .update(changes)
    .eq("id", contactId)
    .eq("owner_user_id", userId);

  if (error) throw error;
}

// Delete a trusted contact.
export async function deleteContact(userId, contactId) {
  const { error } = await supabase
    .from("trusted_contacts")
    .delete()
    .eq("id", contactId)
    .eq("owner_user_id", userId);

  if (error) throw error;
}
