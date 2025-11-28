/**
 * Mock Stripe Helper
 * 
 * Utilities for mocking Stripe SDK in tests
 */

import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

export const mockStripe = stripe as jest.Mocked<typeof stripe>;

/**
 * Mocks Stripe customers.list to return a customer
 * 
 * @param customerId - Stripe customer ID to return
 * @param email - Customer email
 */
export function mockStripeCustomerList(
  customerId: string = "cus_test123",
  email: string = "test@example.com"
): void {
  mockStripe.customers.list = jest.fn().mockResolvedValue({
    data: [
      {
        id: customerId,
        email,
        object: "customer",
        created: Math.floor(Date.now() / 1000),
        metadata: {},
      } as Stripe.Customer,
    ],
    has_more: false,
    url: "",
    object: "list",
  });
}

/**
 * Mocks Stripe customers.list to return empty (no customer found)
 */
export function mockStripeCustomerListEmpty(): void {
  mockStripe.customers.list = jest.fn().mockResolvedValue({
    data: [],
    has_more: false,
    url: "",
    object: "list",
  });
}

/**
 * Mocks Stripe customers.create to return a new customer
 * 
 * @param customerId - Stripe customer ID to return
 * @param email - Customer email
 * @param metadata - Customer metadata
 */
export function mockStripeCustomerCreate(
  customerId: string = "cus_new123",
  email: string = "test@example.com",
  metadata: Record<string, string> = {}
): void {
  mockStripe.customers.create = jest.fn().mockResolvedValue({
    id: customerId,
    email,
    object: "customer",
    created: Math.floor(Date.now() / 1000),
    metadata,
  } as Stripe.Customer);
}

/**
 * Mocks Stripe customers.create to throw an error
 * 
 * @param error - Error to throw
 */
export function mockStripeCustomerCreateError(error: Error): void {
  mockStripe.customers.create = jest.fn().mockRejectedValue(error);
}

/**
 * Mocks Stripe customers.list to throw an error
 * 
 * @param error - Error to throw
 */
export function mockStripeCustomerListError(error: Error): void {
  mockStripe.customers.list = jest.fn().mockRejectedValue(error);
}

/**
 * Mocks Stripe subscriptions.create to return a new subscription
 * 
 * @param subscriptionId - Stripe subscription ID to return
 * @param customerId - Stripe customer ID
 * @param status - Subscription status (default: "trialing")
 * @param trialEndsAt - Trial end timestamp (Unix seconds) or null
 * @param planCode - Plan code for metadata
 */
export function mockStripeSubscriptionCreate(
  subscriptionId: string = "sub_test123",
  customerId: string = "cus_test123",
  status: Stripe.Subscription.Status = "trialing",
  trialEndsAt: number | null = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60, // 14 days from now
  planCode: string = "trial"
): void {
  const now = Math.floor(Date.now() / 1000);
  const periodStart = now;
  const periodEnd = now + 30 * 24 * 60 * 60; // 30 days from now

  mockStripe.subscriptions.create = jest.fn().mockResolvedValue({
    id: subscriptionId,
    object: "subscription",
    customer: customerId,
    status,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    trial_end: trialEndsAt,
    items: {
      object: "list",
      data: [
        {
          id: "si_test123",
          object: "subscription_item",
          price: {
            id: "price_test123",
            object: "price",
          },
        },
      ],
      has_more: false,
    },
    metadata: {
      orgId: "org_test123",
      planCode,
    },
    created: now,
  } as Stripe.Subscription);
}

/**
 * Mocks Stripe subscriptions.create to throw an error
 * 
 * @param error - Error to throw
 */
export function mockStripeSubscriptionCreateError(error: Error): void {
  mockStripe.subscriptions.create = jest.fn().mockRejectedValue(error);
}

/**
 * Mocks Stripe setupIntents.create to return a new SetupIntent
 * 
 * @param setupIntentId - Stripe SetupIntent ID to return
 * @param customerId - Stripe customer ID
 * @param clientSecret - Client secret (default: auto-generated)
 */
export function mockStripeSetupIntentCreate(
  setupIntentId: string = "seti_test123",
  customerId: string = "cus_test123",
  clientSecret: string = "seti_test123_secret_test456"
): void {
  mockStripe.setupIntents.create = jest.fn().mockResolvedValue({
    id: setupIntentId,
    object: "setup_intent",
    customer: customerId,
    client_secret: clientSecret,
    status: "requires_payment_method",
    usage: "off_session",
    metadata: {},
    created: Math.floor(Date.now() / 1000),
  } as Stripe.SetupIntent);
}

/**
 * Mocks Stripe setupIntents.create to throw an error
 * 
 * @param error - Error to throw
 */
export function mockStripeSetupIntentCreateError(error: Error): void {
  mockStripe.setupIntents.create = jest.fn().mockRejectedValue(error);
}

/**
 * Mocks Stripe paymentMethods.attach to successfully attach a payment method
 * 
 * @param paymentMethodId - Payment method ID to return
 * @param customerId - Customer ID the payment method is attached to
 */
export function mockStripePaymentMethodAttach(
  paymentMethodId: string = "pm_test123",
  customerId: string = "cus_test123"
): void {
  mockStripe.paymentMethods.attach = jest.fn().mockResolvedValue({
    id: paymentMethodId,
    object: "payment_method",
    customer: customerId,
    type: "card",
    card: {
      brand: "visa",
      last4: "4242",
      exp_month: 12,
      exp_year: 2025,
    },
  } as Stripe.PaymentMethod);
}

/**
 * Mocks Stripe paymentMethods.attach to throw an error
 * 
 * @param error - Error to throw
 */
export function mockStripePaymentMethodAttachError(error: Error): void {
  mockStripe.paymentMethods.attach = jest.fn().mockRejectedValue(error);
}

/**
 * Mocks Stripe customers.update to successfully update a customer
 * 
 * @param customerId - Customer ID
 * @param defaultPaymentMethodId - Default payment method ID
 */
export function mockStripeCustomerUpdate(
  customerId: string = "cus_test123",
  defaultPaymentMethodId: string = "pm_test123"
): void {
  mockStripe.customers.update = jest.fn().mockResolvedValue({
    id: customerId,
    object: "customer",
    invoice_settings: {
      default_payment_method: defaultPaymentMethodId,
    },
  } as Stripe.Customer);
}

/**
 * Mocks Stripe customers.update to throw an error
 * 
 * @param error - Error to throw
 */
export function mockStripeCustomerUpdateError(error: Error): void {
  mockStripe.customers.update = jest.fn().mockRejectedValue(error);
}

/**
 * Mocks Stripe webhooks.constructEvent to return a valid event
 * 
 * @param eventId - Stripe event ID
 * @param eventType - Event type (e.g., "customer.subscription.updated")
 * @param eventData - Event data object
 */
export function mockStripeWebhookConstructEvent(
  eventId: string = "evt_test123",
  eventType: string = "customer.subscription.updated",
  eventData: any = {}
): void {
  mockStripe.webhooks.constructEvent = jest.fn().mockReturnValue({
    id: eventId,
    object: "event",
    type: eventType,
    data: {
      object: eventData,
    },
    created: Math.floor(Date.now() / 1000),
  } as Stripe.Event);
}

/**
 * Mocks Stripe webhooks.constructEvent to throw an error (invalid signature)
 * 
 * @param error - Error to throw
 */
export function mockStripeWebhookConstructEventError(error: Error): void {
  mockStripe.webhooks.constructEvent = jest.fn().mockImplementation(() => {
    throw error;
  });
}

/**
 * Resets all Stripe mocks
 */
export function resetStripeMocks(): void {
  jest.clearAllMocks();
}

