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
    <div className="theme-app-bg flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-transparent">
      <Suspense fallback={<TopBar title="Chat" />}>
        <div className="hidden md:block">
          <ChatPageTitle />
        </div>
      </Suspense>
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center md:px-4 md:pb-5 md:pt-3 lg:px-5">
            <div className="theme-border theme-surface flex h-full items-center justify-center rounded-[1.4rem] md:flex-1 md:border">
              <span className="theme-text-muted text-sm">Loading...</span>
            </div>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 overflow-hidden md:px-4 md:pb-5 md:pt-3 lg:px-5">
          <ChatContent />
        </div>
      </Suspense>
    </div>
  );
}
