// Environment configuration for the metered subscription platform
export const config = {
  // App
  app: {
    name: "Metered Subscriptions",
    version: "0.1.0",
    url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    timezone: process.env.APP_TIMEZONE || "America/Los_Angeles",
  },
  
  // Plans configuration (from your docs)
  plans: {
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
  },
  
  // Usage tracking
  usage: {
    idempotencyWindowHours: 24,
    defaultMetric: "api_call",
  },
  
  // Webhook configuration
  webhooks: {
    stripe: {
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    },
    clerk: {
      secret: process.env.CLERK_WEBHOOK_SECRET!,
    },
  },
} as const;
