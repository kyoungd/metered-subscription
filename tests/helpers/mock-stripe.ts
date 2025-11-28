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
 * Resets all Stripe mocks
 */
export function resetStripeMocks(): void {
  jest.clearAllMocks();
}

