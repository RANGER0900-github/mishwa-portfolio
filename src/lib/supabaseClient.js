// Supabase Client Configuration
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper functions for analytics
export const trackVisitor = async (visitorData) => {
    try {
        const { data, error } = await supabase
            .from('visitors')
            .insert([visitorData])
            .select()
            .single();

        if (error) {
            console.error('Supabase insert error:', error);
            return null;
        }
        return data;
    } catch (err) {
        console.error('Track visitor error:', err);
        return null;
    }
};

export const updateSessionDuration = async (id, duration) => {
    try {
        const { error } = await supabase
            .from('visitors')
            .update({ session_duration: duration })
            .eq('id', id);

        if (error) console.error('Update session error:', error);
    } catch (err) {
        console.error('Session update error:', err);
    }
};

export const getAnalytics = async () => {
    try {
        const { data, error } = await supabase
            .from('visitors')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            console.error('Supabase fetch error:', error);
            return [];
        }
        return data || [];
    } catch (err) {
        console.error('Get analytics error:', err);
        return [];
    }
};

export const clearAnalytics = async () => {
    try {
        const { error } = await supabase
            .from('visitors')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

        if (error) console.error('Clear analytics error:', error);
        return !error;
    } catch (err) {
        console.error('Clear error:', err);
        return false;
    }
};

// Real-time subscription for live updates
export const subscribeToVisitors = (callback) => {
    const subscription = supabase
        .channel('visitors-channel')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'visitors' },
            (payload) => callback(payload)
        )
        .subscribe();

    return subscription;
};

export default supabase;
