import Stripe from "stripe";
import { env } from "./env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-09-30.clover",
  typescript: true,
});

// Plan configuration from your docs
export const PLANS_CONFIG = {
  trial: {
    stripePriceId: "price_1SF55833pr8E7tWLycMY8XKB",
    apiCalls: 30,
    trialDays: 14,
  },
  starter: {
    stripePriceId: "price_1SF55w33pr8E7tWLQJNWOvxd", 
    apiCalls: 60,
    trialDays: 0,
  },
  growth: {
    stripePriceId: "price_1SF56S33pr8E7tWLslF4FKKW",
    apiCalls: 300,
    trialDays: 0,
  },
  pro: {
    stripePriceId: "price_1SF56w33pr8E7tWLzL6eOFPW",
    apiCalls: 1500,
    trialDays: 0,
  },
} as const;

export type PlanCode = keyof typeof PLANS_CONFIG;
