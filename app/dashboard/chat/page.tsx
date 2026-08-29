"use client";

import { Suspense } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { ChatView } from "@/components/chat/ChatView";

const CHAT_PAGE_FRAME_CLASS =
  "mx-auto w-full max-w-[96rem] px-0 md:px-6 lg:px-8";

function ChatContent() {
  return <ChatView />;
}

export default function ChatPage() {
  return (
    <div className="theme-app-bg flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-transparent">
      <Suspense fallback={<TopBar title="Chat" />}>
        <div className="hidden md:block">
          <TopBar title="Chat" />
        </div>
      </Suspense>
      <Suspense
        fallback={
          <div
            className={`${CHAT_PAGE_FRAME_CLASS} flex min-h-0 flex-1 items-center justify-center md:pb-5 md:pt-3`}
          >
            <div className="theme-border theme-surface flex h-full items-center justify-center rounded-[1.4rem] md:flex-1 md:border">
              <span className="theme-text-muted text-sm">Loading...</span>
            </div>
          </div>
        }
      >
        <div
          className={`${CHAT_PAGE_FRAME_CLASS} flex min-h-0 flex-1 overflow-hidden md:pb-5 md:pt-3`}
        >
          <ChatContent />
        </div>
      </Suspense>
    </div>
  );
}
