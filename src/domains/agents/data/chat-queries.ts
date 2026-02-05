import { useInfiniteQuery } from "@tanstack/react-query";
import * as tauri from "@/domains/tauri/commands";
import { chatKeys } from "./chat-keys";
import type { Message } from "@/types/agent";

const PAGE_SIZE = 200;

interface MessagesPage {
  messages: Message[];
  nextOffset: number | null; // null means no more older messages
  totalCount: number;
}

export function useMessagesQuery(agentId: string | null) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(agentId ?? ""),
    queryFn: async ({ pageParam }): Promise<MessagesPage> => {
      if (!agentId) return { messages: [], nextOffset: null, totalCount: 0 };

      const totalCount = await tauri.getAgentMessagesCount(agentId);

      // pageParam is the offset to load FROM
      // First page: load newest (from end)
      // Subsequent pages: load older (lower offset)
      const offset = pageParam ?? Math.max(0, totalCount - PAGE_SIZE);
      const limit = Math.min(PAGE_SIZE, totalCount - offset);

      if (limit <= 0) {
        return { messages: [], nextOffset: null, totalCount };
      }

      const messages = await tauri.getAgentMessages(agentId, limit, offset);

      // Next offset is lower (older messages), null if we've reached the beginning
      const nextOffset = offset > 0 ? Math.max(0, offset - PAGE_SIZE) : null;

      return { messages, nextOffset, totalCount };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: null as number | null,
    enabled: !!agentId,
    staleTime: Infinity, // Don't auto-refetch, we update via events
  });
}
