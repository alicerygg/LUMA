
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Replace these with your Supabase project credentials.
// Use the publishable/anon key, NEVER the secret/service_role key.
const SUPABASE_URL = "https://kkuyhxndwniflfjlxgtp.supabase.co";
const SUPABASE_KEY = "sb_publishable_80H8GX5T7Raq-xKfjqBX3w_he1fAqmB";

// All authentication files will import this same client.
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);
