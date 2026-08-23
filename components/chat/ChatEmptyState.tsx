"use client";

export function ChatEmptyState({ agentName }: { agentName?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
        Start a conversation{agentName ? ` with ${agentName}` : ""}
      </p>
      <p className="mt-1 text-xs leading-5 text-gray-400 dark:text-gray-500">
        Your message appears immediately while the local worker connects.
      </p>
    </div>
  );
}
