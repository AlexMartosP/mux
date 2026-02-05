import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as tauri from "@/domains/tauri/commands";
import { agentKeys } from "./agents-keys";
import { chatKeys } from "./chat-keys";
import type { Message } from "@/types/agent";

interface MessagesPage {
  messages: Message[];
  nextOffset: number | null;
  totalCount: number;
}

interface MessagesData {
  pages: MessagesPage[];
  pageParams: (number | null)[];
}

export function useSendMessage(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prompt: string) => {
      // Calls restart_agent with the new prompt
      // Backend stores the user message and emits agent-message event
      await tauri.restartAgent(agentId, prompt);
    },
    onMutate: async (prompt: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: chatKeys.messages(agentId) });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<MessagesData>(chatKeys.messages(agentId));

      // Optimistically add user message
      const optimisticMessage: Message = {
        id: `optimistic-${Date.now()}`,
        agent_id: agentId,
        role: "user",
        timestamp: new Date().toISOString(),
        parts: [{ type: "text", content: prompt }],
      };

      queryClient.setQueryData<MessagesData>(chatKeys.messages(agentId), (old) => {
        if (!old?.pages?.length) return old;

        const pages = [...old.pages];
        const lastPage = { ...pages[pages.length - 1] };
        lastPage.messages = [...lastPage.messages, optimisticMessage];
        lastPage.totalCount += 1;
        pages[pages.length - 1] = lastPage;
        return { ...old, pages };
      });

      return { previousData, optimisticId: optimisticMessage.id };
    },
    onError: (_err, _prompt, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(chatKeys.messages(agentId), context.previousData);
      }
    },
    onSettled: () => {
      // Invalidate agents list to update status
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}
