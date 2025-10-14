import { Stigg } from "@stigg/node-server-sdk";
import { env } from "./env";

export const stigg = Stigg.initialize({
  apiKey: env.STIGG_SERVER_API_KEY,
});
