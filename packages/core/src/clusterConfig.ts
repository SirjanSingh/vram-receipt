// Public values only (Supabase project thanks-jensen).
// The anon key is meant to ship in clients; the service-role key never goes here.
export const CLUSTER_URL: string = "https://njihqqbztxavkoxvrebv.supabase.co";
export const CLUSTER_ANON_KEY: string = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qaWhxcWJ6dHhhdmtveHZyZWJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2OTM2ODIsImV4cCI6MjExMDI2OTY4Mn0.EqdHbT8tl_BgcU3qG61Oz2Pv6fj5pyH7GsJ4d4riH2s";
export const SITE_URL = "https://vram-receipt.pages.dev";
// Cloudflare Turnstile site key (public). This is Cloudflare's always-pass TEST key; swap in the
// real one from the Turnstile dashboard, and set TURNSTILE_SECRET to match, before launch.
export const TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
