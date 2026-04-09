"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { wsUrl, getAuthToken } from "./api";

export type ChatWsStatus = "connecting" | "handshaking" | "connected" | "disconnected";
const HANDSHAKE_TIMEOUT_MS = 5000;

interface UseChatWebSocketOptions {
  /** Only connect when true. Defaults to true. */
  enabled?: boolean;
  /** Called for every message received after the handshake completes. */
  onMessage?: (data: unknown) => void;
  /** Called once the backend accepts the handshake. */
  onConnected?: (userId: string | null) => void;
  /** Max reconnect attempts. Defaults to 10. */
  maxRetries?: number;
}

/**
 * WebSocket hook for the chat relay endpoint (`/ws`).
 *
 * Performs the required handshake:
 *   1. Send `{ type: "frontend", token }`
 *   2. Wait for `{ type: "connected" }`
 *
 * Auto-reconnects with exponential backoff on disconnect.
 */
export function useChatWebSocket({
  enabled = true,
  onMessage,
  onConnected,
  maxRetries = 10,
}: UseChatWebSocketOptions) {
  const [status, setStatus] = useState<ChatWsStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handshakeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onMessageRef = useRef(onMessage);
  const onConnectedRef = useRef(onConnected);
  const handshakeCompleteRef = useRef(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    onConnectedRef.current = onConnected;
  }, [onConnected]);

  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = await getAuthToken();
    if (!token) return;

    setStatus("connecting");
    handshakeCompleteRef.current = false;

    const ws = new WebSocket(wsUrl());

    ws.onopen = () => {
      setStatus("handshaking");
      // Send the required handshake message
      ws.send(
        JSON.stringify({
          type: "frontend",
          token,
        }),
      );

      handshakeTimerRef.current = setTimeout(() => {
        if (!handshakeCompleteRef.current) {
          ws.close();
        }
      }, HANDSHAKE_TIMEOUT_MS);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        console.debug("[nenjo] ws message", data);

        // Handle handshake response
        if (!handshakeCompleteRef.current) {
          if (data.type === "connected") {
            handshakeCompleteRef.current = true;
            clearTimeout(handshakeTimerRef.current);
            setStatus("connected");
            retryCountRef.current = 0;
            onConnectedRef.current?.(typeof data.user_id === "string" ? data.user_id : null);
          }
          return;
        }

        // Post-handshake: forward messages to consumer
        onMessageRef.current?.(data);
      } catch {
        // Ignore non-JSON messages (pings, etc.)
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;
      handshakeCompleteRef.current = false;
      clearTimeout(handshakeTimerRef.current);

      // Auto-reconnect with exponential backoff
      if (retryCountRef.current < maxRetries) {
        const delay = Math.min(
          1000 * Math.pow(2, retryCountRef.current),
          30000,
        );
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(() => connectRef.current(), delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [maxRetries]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    clearTimeout(retryTimerRef.current);
    clearTimeout(handshakeTimerRef.current);
    retryCountRef.current = maxRetries; // prevent reconnect
    wsRef.current?.close();
    wsRef.current = null;
    handshakeCompleteRef.current = false;
    setStatus("disconnected");
  }, [maxRetries]);

  const send = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && handshakeCompleteRef.current) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (enabled) {
      const timer = setTimeout(() => {
        void connectRef.current();
      }, 0);
      return () => {
        clearTimeout(timer);
        clearTimeout(retryTimerRef.current);
        clearTimeout(handshakeTimerRef.current);
        retryCountRef.current = maxRetries;
        wsRef.current?.close();
        wsRef.current = null;
        handshakeCompleteRef.current = false;
      };
    } else {
      clearTimeout(retryTimerRef.current);
      clearTimeout(handshakeTimerRef.current);
      retryCountRef.current = maxRetries;
      wsRef.current?.close();
      wsRef.current = null;
      handshakeCompleteRef.current = false;
      const timer = setTimeout(() => {
        setStatus("disconnected");
      }, 0);
      return () => clearTimeout(timer);
    }

    return () => {
      clearTimeout(retryTimerRef.current);
      clearTimeout(handshakeTimerRef.current);
      retryCountRef.current = maxRetries;
      wsRef.current?.close();
      wsRef.current = null;
      handshakeCompleteRef.current = false;
    };
  }, [enabled, connect, disconnect, maxRetries]);

  return { status, send, disconnect };
}
