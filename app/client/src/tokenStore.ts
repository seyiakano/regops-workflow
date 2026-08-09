// Plain (non-React) token accessors so api.ts can read/clear the session
// token without importing the auth context — avoids a circular dependency
// between api.ts and auth.tsx.
const TOKEN_KEY = "regops_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Fired by api.ts whenever a request comes back 401, so AuthProvider can
// drop the stale session and show the login screen again.
export const UNAUTHORIZED_EVENT = "regops:unauthorized";

export function broadcastUnauthorized(): void {
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}
