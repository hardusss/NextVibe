import axios from "axios";
import { storage } from "./storage";
import GetApiUrl from "./url_api";

let isRefreshing = false;
let refreshQueue: any[] = [];

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
    return new Promise((resolve) => refreshQueue.push(resolve));
  }

  isRefreshing = true;

  try {
    const refresh = await getRefresh();
    const res = await axios.post(`${GetApiUrl()}/users/token/refresh/`, { refresh });

    const { access, refresh: newRefresh } = res.data;

    if (access) {
      await saveAccess(access);
      if (newRefresh) await storage.setItem("refresh", newRefresh);

      refreshQueue.forEach((cb) => cb(access));
      refreshQueue = [];

      return access;
    }

    throw new Error("Refresh failed");
  } finally {
    isRefreshing = false;
  }
}

export function setupAxiosInterceptor() {
  axios.interceptors.request.use(async (config) => {
    let access = await getAccess();

    if (access) {
      config.headers.Authorization = `Bearer ${access}`;
    }

    return config;
  });

  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config;

      if (error.response?.status === 401 && !original._retry) {
        original._retry = true;

        try {
          const newAccess = await refreshToken();
          original.headers.Authorization = `Bearer ${newAccess}`;
          return axios(original);
        } catch (e) {
          console.log("Refresh failed after 401");
        }
      }

      return Promise.reject(error);
    }
  );
}