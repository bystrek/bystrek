import { PUBLIC_API_URL } from '$env/static/public';

const TOKEN_KEY = 'bystrek_token';
const AUTH_URL = `${PUBLIC_API_URL}/api/auth`;

export function getToken(): string | null {
	return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
	localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
	localStorage.removeItem(TOKEN_KEY);
}

/** Attaches the stored bearer token, if any, to a fetch call against the API. */
export function authFetch(path: string, init: RequestInit = {}) {
	const token = getToken();
	const headers = new Headers(init.headers);
	if (token) headers.set('Authorization', `Bearer ${token}`);
	return fetch(`${PUBLIC_API_URL}${path}`, { ...init, headers });
}

export async function signIn(email: string, password: string): Promise<void> {
	const res = await fetch(`${AUTH_URL}/sign-in/email`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.message ?? 'Sign in failed.');
	}
	const token = res.headers.get('set-auth-token');
	if (!token) throw new Error('Sign in succeeded but no session token was returned.');
	setToken(token);
}

export type Session = { user: { id: string; name: string | null; role: string } };

export async function getSession(): Promise<Session | null> {
	if (!getToken()) return null;
	const res = await authFetch('/api/auth/get-session');
	if (!res.ok) return null;
	return res.json();
}

export async function signOut(): Promise<void> {
	await authFetch('/api/auth/sign-out', { method: 'POST' });
	clearToken();
}

export async function requestPasswordReset(email: string): Promise<void> {
	const redirectTo = `${window.location.origin}/auth/reset-password`;
	const res = await fetch(`${AUTH_URL}/request-password-reset`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, redirectTo })
	});
	if (!res.ok) throw new Error('Could not request a password reset.');
}

export async function resetPassword(newPassword: string, token: string): Promise<void> {
	const res = await fetch(`${AUTH_URL}/reset-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ newPassword, token })
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.message ?? 'Could not reset the password.');
	}
}
