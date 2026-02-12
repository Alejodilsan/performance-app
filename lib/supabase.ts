import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// La palabra 'export' es OBLIGATORIA para que page.tsx pueda leer esto
export const supabase = createClient(supabaseUrl, supabaseAnonKey)