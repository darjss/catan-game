"use server";

import { experimental_evaluate, type JSONValue } from "ai";

/** A choice option's description: plain text or structured JSON. */
export type OptionDetail = string | { [key: string]: JSONValue } | null;
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
  options: Record<string, OptionDetail>;
}): Promise<string | null> {
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) return null;

  const gateway = createGateway({ apiKey });
  const result = await Promise.race([
    experimental_evaluate({
      model: gateway.evaluation("typesafe-ai/jev"),
      state: input.state,
      questions: {
        move: {
          type: "choice",
          instructions: input.instructions,
          criteria: input.options,
        },
      },
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("jev timed out")), 15_000)),
  ]);
  const choice = result.answers.move.choice;
  const detail = input.options[choice];
  console.info(
    `[bot-ai] jev picked ${choice}: ${
      typeof detail === "string" ? detail : JSON.stringify(detail)
    }`,
  );
  return choice;
}
