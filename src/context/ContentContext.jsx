import { createContext, useContext, useState, useEffect } from 'react';
import { fetchWithRetry } from '../utils/apiUtils';

const ContentContext = createContext();

export const useContent = () => useContext(ContentContext);

export const ContentProvider = ({ children }) => {
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchContent = async () => {
        try {
            const response = await fetchWithRetry('http://localhost:3000/api/content', {}, 3);
            if (!response.ok) throw new Error('Failed to fetch content');
            const data = await response.json();
            setContent(data);
        } catch (err) {
            console.error("Content Fetch Error:", err);
            setError(err);
            // Fallback to local data if API fails (optional, but good for robustness)
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContent();
    }, []);

    const updateContent = async (newContent) => {
        // Optimistic update followed by authoritative sync from server
        const oldContent = content;
        setContent(newContent);

        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch('http://localhost:3000/api/content', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` })
                },
                body: JSON.stringify(newContent)
            });

            // attempt to parse server response
            let data = null;
            try {
                data = await response.json();
            } catch (e) {
                data = null;
            }

            if (!response.ok) {
                const errMsg = (data && (data.error || data.message)) || 'Server error';
                throw new Error(errMsg);
            }

            // If server returned the saved content, use it as authoritative
            if (data && data.content) {
                setContent(data.content);
            } else {
                // Otherwise re-fetch from server to ensure consistency
                await fetchContent();
            }

            return data;
        } catch (err) {
            console.error("Update Failed:", err);
            setContent(oldContent); // Revert on failure
            throw err; // Propagate to caller for toast
        }
    };

    return (
        <ContentContext.Provider value={{ content, loading, error, updateContent, refresh: fetchContent }}>
            {children}
        </ContentContext.Provider>
    );
};
