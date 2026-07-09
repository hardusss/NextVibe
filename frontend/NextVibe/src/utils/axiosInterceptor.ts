import axios from "axios";
import { storage } from "./storage";
import GetApiUrl from "./url_api";

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

async function getAccess() {
    return await storage.getItem("access");
}

async function getRefresh() {
    return await storage.getItem("refresh");
}

async function saveAccess(token: string) {
    await storage.setItem("access", token);
}

async function refreshToken() {
    if (isRefreshing) {
        return new Promise<string | null>((resolve) => refreshQueue.push(resolve));
    }

    isRefreshing = true;

    try {
        const refresh = await getRefresh();

        if (!refresh) {
            throw new Error("No refresh token");
        }

        const res = await axios.post(`${GetApiUrl()}/users/token/refresh/`, { refresh });
        const { access, refresh: newRefresh } = res.data;

        if (!access) {
            throw new Error("Refresh failed: no access token in response");
        }

        await saveAccess(access);
        if (newRefresh) await storage.setItem("refresh", newRefresh);

        refreshQueue.forEach((cb) => cb(access));
        refreshQueue = [];

        return access as string;

    } catch (error) {
        refreshQueue.forEach((cb) => cb(null));
        refreshQueue = [];
        throw error;

    } finally {
        isRefreshing = false;
    }
}

export function setupAxiosInterceptor() {
    axios.interceptors.request.use(async (config) => {
        const access = await getAccess();
        if (access) {
            config.headers.Authorization = `Bearer ${access}`;
        }
        return config;
    });

    axios.interceptors.response.use(
        (response) => response,
        async (error) => {
            const original = error.config;
            const isAuthEndpoint = original.url && (
                original.url.includes('/users/login/') ||
                original.url.includes('/users/register/') ||
                original.url.includes('/users/wallet-sign-in/') ||
                original.url.includes('/users/google-sign-in/') ||
                original.url.includes('/users/apple-sign-in/') ||
                original.url.includes('/users/token/')
            );

            if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
                original._retry = true;

                try {
                    const newAccess = await refreshToken();

                    if (!newAccess) {
                        return Promise.reject(error);
                    }

                    original.headers.Authorization = `Bearer ${newAccess}`;
                    return axios(original);

                } catch (e) {
                    console.log("Refresh failed after 401");
                    return Promise.reject(e);
                }
            }

            return Promise.reject(error);
        }
    );
}