import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://sofybjtkbjzxlunzysyg.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvZnlianRrYmp6eGx1bnp5c3lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NDk4NzEsImV4cCI6MjA4MzAyNTg3MX0.fQMLMUFppzIlCCum29RFKGakM9r96kdlYhl1V2oGZfk';

let supabaseInstance = null;

if (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'YOUR_SUPABASE_URL') {
    try {
        supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    } catch (e) {
        console.error('Failed to create Supabase client:', e);
    }
}

// Fallback mock to prevent crashes when calling .from()
export const supabase = supabaseInstance || {
    from: () => ({
        select: () => ({ limit: () => Promise.resolve({ data: [], error: null }), order: () => Promise.resolve({ data: [], error: null }) }),
        insert: () => Promise.resolve({ error: null }),
        upsert: () => Promise.resolve({ error: null }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => { },
};
