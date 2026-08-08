<script lang="ts">
	import { PUBLIC_API_URL } from '$env/static/public';

	let status = $state('');
	let subscribed = $state(false);
	let busy = $state(false);

	function urlBase64ToUint8Array(base64String: string) {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
		const raw = atob(base64);
		return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
	}

	async function subscribe() {
		busy = true;
		try {
			if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
				status = "Push isn't available here — on iPhone, add this page to your Home Screen and open it from there first.";
				return;
			}

			status = 'Requesting permission…';
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				status = 'Permission denied.';
				return;
			}

			status = 'Registering…';
			const registration = await navigator.serviceWorker.register('/sw.js');
			await navigator.serviceWorker.ready;

			const { publicKey } = await fetch(`${PUBLIC_API_URL}/push/vapid-public-key`).then((r) =>
				r.json()
			);
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(publicKey)
			});

			await fetch(`${PUBLIC_API_URL}/push/subscribe`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(subscription)
			});

			status = 'Subscribed.';
			subscribed = true;
		} catch (err) {
			status = 'Something went wrong: ' + (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function sendTest() {
		busy = true;
		status = 'Sending…';
		try {
			const res = await fetch(`${PUBLIC_API_URL}/push/send`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'bystrek', message: 'Test notification — this is working.' })
			});
			const result = await res.json();
			status = `Sent to ${result.sent}, removed ${result.removed}, failed ${result.failed}.`;
		} catch (err) {
			status = 'Something went wrong: ' + (err as Error).message;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
		navigator.serviceWorker.getRegistration().then(async (reg) => {
			const sub = reg && (await reg.pushManager.getSubscription());
			if (sub) {
				subscribed = true;
				status = 'Already subscribed on this device.';
			}
		});
	});
</script>

<main>
	<h1>bystrek</h1>
	<p>Enable notifications to let the assistant reach you. (Chat is offline for now — back soon.)</p>
	<button onclick={subscribe} disabled={busy || subscribed}>
		{subscribed ? 'Subscribed' : 'Enable notifications'}
	</button>
	<button onclick={sendTest} disabled={busy || !subscribed}>Send test notification</button>
	<div id="status">{status}</div>
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
		font-size: 28px;
		letter-spacing: 0.02em;
		margin: 0 0 8px;
	}
	p {
		opacity: 0.8;
		line-height: 1.5;
		margin: 0 0 28px;
	}
	button {
		font: inherit;
		font-size: 16px;
		font-weight: 600;
		padding: 14px 28px;
		border-radius: 999px;
		border: none;
		background: #591622;
		color: #f3e7d3;
		cursor: pointer;
		margin: 0 6px 12px;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	#status {
		margin-top: 20px;
		font-size: 14px;
		opacity: 0.75;
		min-height: 1.2em;
	}
</style>
