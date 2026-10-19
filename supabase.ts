import { createClient } from '@supabase/supabase-js';

// Base Supabase Project URL and Anon Key
export const SUPABASE_URL = 'https://aaaxthkffyfkkjdubwah.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhYXh0aGtmZnlma2tqZHVid2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjUzMjYsImV4cCI6MjEwNzc0MTMyNn0.8ehAbxdOi59wjtPcGNAmNGnrJBXn6ZmPeC2abluDqzA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;
