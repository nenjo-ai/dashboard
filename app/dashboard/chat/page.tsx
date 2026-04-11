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
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <Suspense fallback={<TopBar title="Chat" />}>
        <ChatPageTitle />
      </Suspense>
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="flex h-full items-center justify-center">
              <span className="text-sm text-gray-400">Loading...</span>
            </div>
          </div>
        }
      >
        <ChatContent />
      </Suspense>
    </div>
  );
}
