"use client";

export type SseEvent = {
  event: string;
  data: unknown;
};

function findEventBoundary(buffer: string): number {
  const match = /\r?\n\r?\n/.exec(buffer);
  return match ? match.index : -1;
}

function decodeEventBlock(block: string): SseEvent | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

function createSseTextParser(onEvent: (event: SseEvent) => void) {
  let buffer = "";

  return {
    push(chunk: string) {
      buffer += chunk;

      let boundary = findEventBoundary(buffer);
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        const separatorMatch = /\r?\n\r?\n/.exec(buffer.slice(boundary));
        const separatorLength = separatorMatch?.[0].length ?? 2;
        buffer = buffer.slice(boundary + separatorLength);
        const parsed = decodeEventBlock(block);
        if (parsed) {
          onEvent(parsed);
        }
        boundary = findEventBoundary(buffer);
      }
    },
    flush() {
      const finalBlock = buffer.trim();
      if (!finalBlock) return;
      const parsed = decodeEventBlock(finalBlock);
      if (parsed) {
        onEvent(parsed);
      }
      buffer = "";
    },
  };
}

export async function consumeSseStream(
  response: Response,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response body unavailable");
  }

  const decoder = new TextDecoder();
  const parser = createSseTextParser(onEvent);

  while (true) {
    const { done, value } = await reader.read();
    parser.push(decoder.decode(value ?? new Uint8Array(), { stream: !done }));

    if (done) {
      parser.flush();
      return;
    }
  }
}

export async function consumeSseStreamXhr(options: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  onEvent: (event: SseEvent) => void;
}): Promise<void> {
  const { url, method = "GET", headers, body, signal, onEvent } = options;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const parser = createSseTextParser(onEvent);
    let lastIndex = 0;

    const cleanup = () => {
      xhr.onprogress = null;
      xhr.onerror = null;
      xhr.onload = null;
      xhr.onabort = null;
      signal?.removeEventListener("abort", abortXhr);
    };

    const readNewText = () => {
      const nextText = xhr.responseText.slice(lastIndex);
      if (!nextText) return;
      lastIndex = xhr.responseText.length;
      parser.push(nextText);
    };

    const abortXhr = () => {
      xhr.abort();
    };

    xhr.open(method, url, true);
    Object.entries(headers ?? {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.onprogress = () => {
      readNewText();
    };

    xhr.onload = () => {
      readNewText();
      parser.flush();
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(xhr.responseText || `Request failed with status ${xhr.status}`));
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error("Network error while streaming response"));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    signal?.addEventListener("abort", abortXhr);
    xhr.send(body);
  });
}
