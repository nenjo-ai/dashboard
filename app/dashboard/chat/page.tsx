"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { ChatView } from "@/components/chat/ChatView";

function ChatContent() {
  return <ChatView />;
}

function ChatPageTitle() {
  const searchParams = useSearchParams();
  const isNotifications = searchParams.get("channel") === "notifications";
  return <TopBar title={isNotifications ? "Notifications" : "Chat"} />;
}

export default function ChatPage() {
  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <Suspense fallback={<TopBar title="Chat" />}>
        <ChatPageTitle />
      </Suspense>
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center md:px-6 md:py-6 lg:px-8">
            <div className="flex h-full items-center justify-center rounded-xl md:flex-1 md:border md:border-gray-200 md:bg-white md:dark:border-gray-700 md:dark:bg-gray-900">
              <span className="text-sm text-gray-400">Loading...</span>
            </div>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 overflow-hidden md:px-6 md:py-6 lg:px-8">
          <ChatContent />
        </div>
      </Suspense>
    </div>
  );
}
