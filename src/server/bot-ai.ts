"use server";

import { experimental_evaluate, type JSONValue } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { env } from "virtual:env/server";

/**
 * Ask TypeSafe's Jev (via Vercel AI Gateway) to pick one of the bot's legal
 * moves. Jev is an evaluation model: it scores a shared state against typed
 * questions, it does not chat. Returns the chosen option key, or null when no
 * gateway key is configured (caller falls back to heuristics).
 */
export async function chooseBotMove(input: {
  state: Record<string, JSONValue>;
  instructions: string;
  options: Record<string, string>;
}): Promise<string | null> {
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) return null;

  const gateway = createGateway({ apiKey });
  const result = await experimental_evaluate({
    model: gateway.evaluation("typesafe-ai/jev"),
    state: input.state,
    questions: {
      move: {
        type: "choice",
        instructions: input.instructions,
        criteria: input.options,
      },
    },
  });
  return result.answers.move.choice;
}
