"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { ChatView } from "@/components/chat/ChatView";
import { PageContent } from "@/components/ui/PageContent";

function ChatContent() {
  return (
    <PageContent className="min-h-0 flex-1">
      <ChatView />
    </PageContent>
  );
}

function ChatPageTitle() {
  const searchParams = useSearchParams();
  const isNotifications = searchParams.get("channel") === "notifications";
  return <TopBar title={isNotifications ? "Notifications" : "Chat"} />;
}

export default function ChatPage() {
  return (
    <div className="flex h-screen flex-col">
      <Suspense fallback={<TopBar title="Chat" />}>
        <ChatPageTitle />
      </Suspense>
      <Suspense
        fallback={
          <PageContent className="min-h-0 flex-1">
            <div className="flex h-full items-center justify-center">
              <span className="text-sm text-gray-400">Loading...</span>
            </div>
          </PageContent>
        }
      >
        <ChatContent />
      </Suspense>
    </div>
  );
}
