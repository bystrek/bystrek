function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const DATABASE_URL = required('DATABASE_URL');
export const VAPID_PUBLIC_KEY = required('VAPID_PUBLIC_KEY');
export const VAPID_PRIVATE_KEY = required('VAPID_PRIVATE_KEY');
export const VAPID_SUBJECT = required('VAPID_SUBJECT');
export const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'https://bystrek.dev')
  .split(',')
  .map((origin) => origin.trim());
