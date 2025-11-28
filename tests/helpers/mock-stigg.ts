/**
 * Mock Stigg Helper
 * 
 * Utilities for mocking Stigg SDK in tests
 */

import { stigg } from "@/lib/stigg";

export const mockStigg = stigg as jest.Mocked<typeof stigg>;

/**
 * Mocks Stigg provisionSubscription to succeed
 */
export function mockStiggProvisionSubscriptionSuccess(): void {
  mockStigg.provisionSubscription = jest.fn().mockResolvedValue(undefined);
}

/**
 * Mocks Stigg provisionSubscription to throw an error
 * 
 * @param error - Error to throw
 */
export function mockStiggProvisionSubscriptionError(error: Error): void {
  mockStigg.provisionSubscription = jest.fn().mockRejectedValue(error);
}

/**
 * Resets all Stigg mocks
 */
export function resetStiggMocks(): void {
  jest.clearAllMocks();
}

