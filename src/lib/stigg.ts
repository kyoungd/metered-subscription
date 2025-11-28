import { Stigg } from "@stigg/node-server-sdk";
import { env } from "./env";
import { PlanCode } from "./stripe";

export const stigg = Stigg.initialize({
  apiKey: env.STIGG_SERVER_API_KEY,
});

/**
 * Mapping from internal plan codes to Stigg Plan IDs
 * 
 * Update these with your actual Stigg plan IDs from the Stigg dashboard.
 * Stigg plan IDs are typically in the format: "plan_xxxxx" or similar.
 */
export const STIGG_PLAN_MAPPING: Record<PlanCode, string> = {
  trial: process.env.STIGG_PLAN_ID_TRIAL || "plan_trial",
  starter: process.env.STIGG_PLAN_ID_STARTER || "plan_starter",
  growth: process.env.STIGG_PLAN_ID_GROWTH || "plan_growth",
  pro: process.env.STIGG_PLAN_ID_PRO || "plan_pro",
} as const;

/**
 * Gets Stigg plan ID for a given plan code
 * 
 * @param planCode - Internal plan code
 * @returns Stigg plan ID
 */
export function getStiggPlanId(planCode: PlanCode): string {
  return STIGG_PLAN_MAPPING[planCode];
}
