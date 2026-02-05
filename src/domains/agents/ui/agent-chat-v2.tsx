import { useRef, useEffect } from "react";
import type { Agent } from "@/types/agent";
import { OutputRenderer } from "@/components/OutputRenderer";
import { useAgentChat } from "../hooks/useAgentChat";
import { FloatingInput } from "./floating-input";
import { StatusBanners } from "./status-banners";

const SCROLL_THRESHOLD = 100; // Pixels from top to trigger load more

interface AgentChatV2Props {
  agent: Agent;
  onStop: (id: string) => void;
  onUpdateAgent?: (agent: Agent) => void;
}

export function AgentChatV2({ agent, onStop, onUpdateAgent }: AgentChatV2Props) {
  const { messages, sendMessage, isLoading, isLoadingMore, hasMore, loadMore, isSending } =
    useAgentChat(agent.id);

  const outputRef = useRef<HTMLDivElement>(null);
  const previousScrollHeightRef = useRef<number>(0);
  const isRunning = agent.status === "running";

  // Auto-scroll to bottom when new messages arrive (if near bottom)
  useEffect(() => {
    if (!outputRef.current) return;

    const el = outputRef.current;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

    // Only auto-scroll if within 150px of the bottom
    if (distanceFromBottom < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Preserve scroll position after loading older messages
  useEffect(() => {
    if (!outputRef.current || previousScrollHeightRef.current === 0) return;

    const el = outputRef.current;
    const newScrollHeight = el.scrollHeight;
    const scrollDiff = newScrollHeight - previousScrollHeightRef.current;

    if (scrollDiff > 0) {
      el.scrollTop += scrollDiff;
    }
    previousScrollHeightRef.current = 0;
  }, [messages]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isLoadingMore || !hasMore) return;

    const el = e.currentTarget;
    if (el.scrollTop < SCROLL_THRESHOLD) {
      previousScrollHeightRef.current = el.scrollHeight;
      loadMore();
    }
  };


  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">

      <div className="flex-1 overflow-y-auto pt-14 pb-24" ref={outputRef} onScroll={handleScroll}>
        <div className="max-w-3xl px-4 mx-auto">
          {/* Loading more indicator */}
          {isLoadingMore && (
            <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
              Loading older messages...
            </div>
          )}

          {/* Loading state */}
          {isLoading && messages.length === 0 && (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              Loading messages...
            </div>
          )}

          {/* Messages from hook */}
          <OutputRenderer
            output={messages}
            isRunning={isRunning}
            repositoryPath={agent.repository_path}
          />
        </div>
      </div>

      <div className="max-w-4xl px-4 pb-4 mx-auto w-full">
        <FloatingInput
          agent={agent}
          onSendMessage={sendMessage}
          isSending={isSending}
        />
      </div>
    </div>
  );
}
