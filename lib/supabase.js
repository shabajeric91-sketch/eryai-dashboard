import { createClient } from '@supabase/supabase-js'

/** @typedef {import('../types/database.types').Database} Database */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Typad Supabase-klient för automatisk felkontroll.
 * All kod som importerar denna klient får automatisk validering
 * av tabellnamn och kolumner mot database.types.ts
 * 
 * @type {import('@supabase/supabase-js').SupabaseClient<Database>}
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
