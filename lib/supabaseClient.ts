import { createClient } from '@supabase/supabase-js';

// Reemplaza con tus credenciales de Supabase (Settings > API)
const supabaseUrl = 'https://rquhakdxqdoqwqsivgga.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdWhha2R4cWRvcXdxc2l2Z2dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODg0MjgsImV4cCI6MjA5MDE2NDQyOH0.QTyds7vKjqrBBGxq9Nqufng_5Qaw9w6ObgdhguAq2NM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);