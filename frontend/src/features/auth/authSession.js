export const SESSION_CHANGED_EVENT = "atelier:session-changed";

function getStorage() {
    return typeof window === "undefined" ? null : window.localStorage;
}

export function getAccessToken() {
    return getStorage()?.getItem("access") || null;
}

export function getAuthenticatedUser() {
    const token = getAccessToken();
    if (!token) return null;

    try {
        const payloadPart = token.split(".")[1];
        if (!payloadPart) return null;
        const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(window.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
        const firstName = payload.first_name || payload.prenomUtilisateur || "";
        const lastName = payload.last_name || payload.nomUtilisateur || "";
        const name = `${firstName} ${lastName}`.trim() || payload.email || "";
        if (!name) return null;
        const roles = {
            Admin: "Administrateur",
            admin: "Administrateur",
            achateur: "Acheteur",
            acheteur: "Acheteur",
            responsable: "Responsable achats",
        };
        return {
            id: payload.user_id,
            email: payload.email || "",
            firstName,
            lastName,
            name,
            role: roles[payload.role] || payload.role || "Utilisateur",
        };
    } catch {
        return null;
    }
}

export function getRefreshToken() {
    return getStorage()?.getItem("refresh") || null;
}

export function isAccessTokenValid(token = getAccessToken()) {
    if (!token) return false;

    try {
        const payload = JSON.parse(window.atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
    } catch {
        return false;
    }
}

export function storeTokens({ access, refresh }) {
    const storage = getStorage();
    if (!storage) return;

    storage.setItem("access", access);
    if (refresh) storage.setItem("refresh", refresh);
    window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: { authenticated: true } }));
}

export function clearTokens() {
    const storage = getStorage();
    if (!storage) return;

    storage.removeItem("access");
    storage.removeItem("refresh");
    window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: { authenticated: false } }));
}
