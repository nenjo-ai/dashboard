import type { ChatStreamConnectionState } from "./streamSubscription.ts";
import type { ChatTurnEvent } from "./state.ts";

const TRANSPORT_RECONNECT_MESSAGE =
  "Live connection interrupted. The agent is still running; reconnecting…";

/** Project transport state into the live-turn state machine. */
export function chatStreamConnectionEvents(
  connection: ChatStreamConnectionState,
): ChatTurnEvent[] {
  if (connection.state === "reconnecting") {
    return [
      { type: "connection_changed", status: "reconnecting" },
      {
        type: "notice_set",
        notice: {
          source: "transport",
          tone: "warning",
          message: TRANSPORT_RECONNECT_MESSAGE,
        },
      },
    ];
  }

  return [
    { type: "connection_changed", status: "connected" },
    { type: "notice_cleared", source: "transport" },
  ];
}
