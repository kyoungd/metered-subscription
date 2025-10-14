import { z } from "zod";

const envSchema = z.object({
  // Clerk
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
  CLERK_SECRET_KEY: z.string(),
  
  // Stripe
  STRIPE_SECRET_KEY: z.string(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  
  // Stigg
  STIGG_SERVER_API_KEY: z.string(),
  
  // Database
  DATABASE_URL: z.string(),
  
  // Redis (for caching)
  REDIS_URL: z.string().optional(),
  
  // App
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXTAUTH_SECRET: z.string(),
  NEXTAUTH_URL: z.string().default("http://localhost:3000"),
});

export const env = envSchema.parse(process.env);
