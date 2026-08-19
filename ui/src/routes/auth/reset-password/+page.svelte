<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resetPassword } from '$lib/auth';

	let newPassword = $state('');
	let status = $state('');
	let busy = $state(false);
	let done = $state(false);

	const token = page.url.searchParams.get('token');
	const error = page.url.searchParams.get('error');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!token) return;
		busy = true;
		status = '';
		try {
			await resetPassword(newPassword, token);
			done = true;
			status = 'Password updated. Redirecting to sign in…';
			setTimeout(() => goto('/'), 1500);
		} catch (err) {
			status = (err as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<main>
	<h1>Set a new password</h1>

	{#if !token}
		<p>
			{error === 'INVALID_TOKEN'
				? 'This reset link is invalid or has expired. Request a new one from the sign-in page.'
				: 'This link is missing a reset token.'}
		</p>
	{:else if !done}
		<form onsubmit={submit}>
			<input
				type="password"
				bind:value={newPassword}
				placeholder="New password"
				autocomplete="new-password"
				required
				minlength="8"
			/>
			<button type="submit" disabled={busy}>Set password</button>
		</form>
	{/if}

	{#if status}<div id="status">{status}</div>{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f3e7d3;
		color: #591622;
		font-family:
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		padding: 24px;
	}
	main {
		max-width: 360px;
		text-align: center;
	}
	h1 {
		font-size: 22px;
		letter-spacing: 0.02em;
		margin: 0 0 20px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	input {
		font: inherit;
		font-size: 16px;
		padding: 10px 14px;
		border-radius: 8px;
		border: 1px solid rgba(89, 22, 34, 0.25);
		background: #fff;
	}
	button {
		font: inherit;
		font-size: 16px;
		font-weight: 600;
		padding: 12px 24px;
		border-radius: 999px;
		border: none;
		background: #591622;
		color: #f3e7d3;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	#status {
		margin-top: 16px;
		font-size: 14px;
		opacity: 0.75;
	}
</style>
