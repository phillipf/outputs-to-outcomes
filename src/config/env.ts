type RequiredEnvKey =
  | 'VITE_SUPABASE_URL'
  | 'VITE_SUPABASE_ANON_KEY'
  | 'VITE_ALLOWED_EMAIL'

function readRequiredEnv(key: RequiredEnvKey): string {
  const value = import.meta.env[key]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value
}

export const env = {
  supabaseUrl: readRequiredEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: readRequiredEnv('VITE_SUPABASE_ANON_KEY'),
  allowedEmail: readRequiredEnv('VITE_ALLOWED_EMAIL').toLowerCase(),
}
