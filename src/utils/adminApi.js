export const adminFetch = (url, options = {}) => {
    const { headers, ...rest } = options;
    return fetch(url, {
        credentials: 'include',
        ...rest,
        headers: {
            ...(headers || {})
        }
    }).then((response) => {
        if (response.status === 401 && typeof window !== 'undefined') {
            const inAdmin = window.location.pathname.startsWith('/admin');
            const inLogin = window.location.pathname.startsWith('/admin/login');
            if (inAdmin && !inLogin) {
                window.location.href = '/admin/login';
            }
        }
        return response;
    });
};

export const adminJsonFetch = async (url, options = {}) => {
    const { body, headers, ...rest } = options;
    const response = await adminFetch(url, {
        ...rest,
        headers: {
            'Content-Type': 'application/json',
            ...(headers || {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    return { response, data };
};
