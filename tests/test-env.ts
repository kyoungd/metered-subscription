/**
 * Test Environment Data
 * 
 * This file contains test data and credentials for integration testing.
 * Please fill in the values below before running tests.
 */

export const TEST_ENV = {
  // Organization
  org: {
    clerkOrgId: "org_test_123",
    name: "Test Organization",
    adminEmail: "admin@test.com",
  },

  // Clerk
  clerk: {
    // A valid Clerk session token or user ID for testing
    userId: "user_test_123",
    sessionToken: "", 
  },

  // Stripe
  stripe: {
    // A test customer ID if you want to reuse one
    existingCustomerId: "",
    // A valid payment method ID (e.g. pm_card_visa)
    paymentMethodId: "pm_card_visa",
  },

  // Stigg
  stigg: {
    // A test plan ID from your Stigg dashboard
    planId: "",
  },
};
