"use client";

import { fetchAgents, createChatSession } from "@/lib/api";
import { findNenjiAgent } from "@/lib/nenjiAgent";

/**
 * Shared Nenji welcome priming used by both the onboarding connect step and
 * the harness pairing landing page: creates the first chat session with the
 * Nenji agent and seeds the local welcome message the chat page renders.
 */

export const LOCAL_CHAT_SEED_KEY = "nenjo:local_chat_seed";
export const NENJI_GREETING_DELAY_MS = 6000;

export const DEFAULT_CONNECTED_GREETING =
  "Welcome to Nenjo. Nenji is online and ready to help you shape agents, routines, and context. What kind of workflow do you want to build first?";

export const DEFAULT_SKIP_MESSAGE =
  "This is an automated message since the worker is not connected. Nenji will be able to help you once you connect the worker. Until then, feel free to browse around. Check out how Nenji is structured under Agents, or open the routine editor page.";

export interface PrimedWelcome {
  sessionId: string;
  roleId: string;
  color: string | null;
}

/**
 * Create the welcome chat session with Nenji and seed the local greeting.
 * Returns null when the Nenji agent cannot be found.
 */
export async function primeNenjiWelcome(displayName: string): Promise<PrimedWelcome | null> {
  const agents = await fetchAgents();
  const nenjiAgent = findNenjiAgent(agents);
  if (!nenjiAgent) return null;

  const session = await createChatSession({
    agent_id: nenjiAgent.id,
    title: "Welcome",
  });

  sessionStorage.setItem(
    LOCAL_CHAT_SEED_KEY,
    JSON.stringify({
      session_id: session.id,
      timestamp: session.created_at,
      message: `Welcome to Nenjo, ${displayName}. ${DEFAULT_CONNECTED_GREETING.slice("Welcome to Nenjo. ".length)}`,
    }),
  );

  return {
    sessionId: session.id,
    roleId: nenjiAgent.id,
    color: nenjiAgent.color ?? null,
  };
}

/** Seed the local chat with the "connect later" message and return its target. */
export async function seedSkippedWelcome(): Promise<string> {
  try {
    const agents = await fetchAgents();
    const nenjiAgent = findNenjiAgent(agents);
    if (!nenjiAgent) return "/dashboard/chat";

    const session = await createChatSession({
      agent_id: nenjiAgent.id,
      title: "Welcome",
    });
    sessionStorage.setItem(
      LOCAL_CHAT_SEED_KEY,
      JSON.stringify({
        session_id: session.id,
        timestamp: session.created_at,
        message: DEFAULT_SKIP_MESSAGE,
      }),
    );
    return `/dashboard/chat?session=${session.id}`;
  } catch {
    return "/dashboard/chat";
  }
}
