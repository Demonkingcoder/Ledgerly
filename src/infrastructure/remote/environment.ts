import { z } from 'zod';

const publicEnvironmentSchema = z.object({
  VITE_API_BASE_URL: z.string().url().optional().or(z.literal('')),
});

const parsed = publicEnvironmentSchema.safeParse({ VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL });

export const environment = parsed.success
  ? { apiBaseUrl: parsed.data.VITE_API_BASE_URL || null, remoteConfigured: Boolean(parsed.data.VITE_API_BASE_URL) }
  : { apiBaseUrl: null, remoteConfigured: false };
