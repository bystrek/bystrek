function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const PORT = Number(process.env.PORT ?? 8787);
export const VAPID_PUBLIC_KEY = requireEnv("VAPID_PUBLIC_KEY");
export const VAPID_PRIVATE_KEY = requireEnv("VAPID_PRIVATE_KEY");
export const VAPID_SUBJECT = requireEnv("VAPID_SUBJECT");
