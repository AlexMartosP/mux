import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTauriListen } from "@/hooks/useTauriListen";
import { useMessagesQuery } from "../data/chat-queries";
import { useSendMessage } from "../data/chat-mutations";
import { chatKeys } from "../data/chat-keys";
import type { OutputLine, OutputEvent, Message, AgentMessageEvent } from "@/types/agent";

// Legacy format for backward compatibility
interface LegacyMessagesPage {
  messages: OutputLine[];
  nextOffset: number | null;
  totalCount: number;
}

interface LegacyMessagesData {
  pages: LegacyMessagesPage[];
  pageParams: (number | null)[];
}

// New message format
interface MessagesPage {
  messages: Message[];
  nextOffset: number | null;
  totalCount: number;
}

interface MessagesData {
  pages: MessagesPage[];
  pageParams: (number | null)[];
}

export function useAgentChat(agentId: string | null) {
  const queryClient = useQueryClient();

  // Infinite query for messages
  const messagesQuery = useMessagesQuery(agentId);

  // Send message mutation
  const sendMutation = useSendMessage(agentId ?? "");

  // Flatten pages into single messages array
  // Pages are loaded newest-first, so we need to reverse to get chronological order
  const messages = useMemo(() => {
    if (!messagesQuery.data?.pages) return [];
    return messagesQuery.data.pages
      .slice()
      .reverse()
      .flatMap((page) => page.messages);
  }, [messagesQuery.data?.pages]);

  // Listen for new message events (new architecture)
  useTauriListen<AgentMessageEvent>("agent-message", (event) => {
    if (!agentId || event.payload.agent_id !== agentId) return;

    const { event_type, message_id } = event.payload;

    queryClient.setQueryData<MessagesData>(chatKeys.messages(agentId), (old) => {
      if (!old?.pages?.length) return old;

      const pages = [...old.pages];
      const lastPage = { ...pages[pages.length - 1] };

      if (event_type === "message_created") {
        // Add new empty message
        const newMessage: Message = {
          id: message_id,
          agent_id: agentId,
          role: event.payload.role!,
          timestamp: event.payload.timestamp!,
          parts: [],
        };
        lastPage.messages = [...lastPage.messages, newMessage];
        lastPage.totalCount += 1;
      } else if (event_type === "message_deleted") {
        // Remove message that had no content (all Mux events)
        lastPage.messages = lastPage.messages.filter((msg) => msg.id !== message_id);
        lastPage.totalCount = Math.max(0, lastPage.totalCount - 1);
      } else if (event_type === "message_complete" && event.payload.parts) {
        // Add complete message with all parts (optimized for user messages)
        // Check if there's an optimistic message to replace (for user messages)
        const newMessage: Message = {
          id: message_id,
          agent_id: agentId,
          role: event.payload.role!,
          timestamp: event.payload.timestamp!,
          parts: event.payload.parts,
        };

        // Find and replace optimistic message if exists, otherwise append
        const optimisticIndex = lastPage.messages.findIndex(
          (msg) => msg.id.startsWith("optimistic-") && msg.role === "user"
        );

        if (optimisticIndex !== -1) {
          // Replace optimistic message with real one
          lastPage.messages = [
            ...lastPage.messages.slice(0, optimisticIndex),
            newMessage,
            ...lastPage.messages.slice(optimisticIndex + 1),
          ];
        } else {
          // No optimistic message found, append normally
          lastPage.messages = [...lastPage.messages, newMessage];
          lastPage.totalCount += 1;
        }
      } else if (event_type === "message_part" && event.payload.part) {
        // Append part to existing message
        lastPage.messages = lastPage.messages.map((msg) =>
          msg.id === message_id
            ? { ...msg, parts: [...msg.parts, event.payload.part!] }
            : msg
        );
      }

      pages[pages.length - 1] = lastPage;
      return { ...old, pages };
    });
  });

  // Legacy: Listen for streaming output events (backward compatibility)
  useTauriListen<OutputEvent>("agent-output", (event) => {
    if (!agentId || event.payload.agent_id !== agentId) return;

    const newMessage: OutputLine = {
      output_type: event.payload.output_type,
      content: event.payload.content,
      timestamp: event.payload.timestamp,
    };

    // Append to last page (newest messages)
    queryClient.setQueryData<LegacyMessagesData>(chatKeys.legacyMessages(agentId), (old) => {
      if (!old?.pages?.length) return old;

      const pages = [...old.pages];
      const lastPage = { ...pages[pages.length - 1] };
      lastPage.messages = [...lastPage.messages, newMessage];
      lastPage.totalCount += 1;
      pages[pages.length - 1] = lastPage;
      return { ...old, pages };
    });
  });

  // Send message function
  const sendMessage = useCallback(
    (prompt: string) => {
      if (!prompt.trim()) return;
      sendMutation.mutate(prompt.trim());
    },
    [sendMutation]
  );

  return {
    messages,
    sendMessage,
    isLoading: messagesQuery.isLoading,
    isLoadingMore: messagesQuery.isFetchingNextPage,
    hasMore: messagesQuery.hasNextPage ?? false,
    loadMore: messagesQuery.fetchNextPage,
    isSending: sendMutation.isPending,
  };
}
