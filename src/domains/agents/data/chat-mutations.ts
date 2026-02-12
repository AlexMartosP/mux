import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as tauri from "@/domains/tauri/commands";
import { agentKeys } from "./agents-keys";
import { chatKeys } from "./chat-keys";
import type { Message, ImageAttachment, MessagePart } from "@/types/agent";

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
    mutationFn: async ({ prompt, images }: { prompt: string; images?: ImageAttachment[] }) => {
      // Calls restart_agent with the new prompt and optional images
      // Backend stores the user message and emits agent-message event
      await tauri.restartAgent(agentId, prompt, images);
    },
    onMutate: async ({ prompt, images }: { prompt: string; images?: ImageAttachment[] }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: chatKeys.messages(agentId) });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<MessagesData>(chatKeys.messages(agentId));

      // Build message parts (text + images)
      const parts: MessagePart[] = [];
      if (prompt.trim()) {
        parts.push({ type: "text", content: prompt });
      }
      if (images && images.length > 0) {
        parts.push(
          ...images.map((img): MessagePart => ({
            type: "image",
            media_type: img.mediaType,
            data: img.data,
          }))
        );
      }

      // Optimistically add user message
      const optimisticMessage: Message = {
        id: `optimistic-${Date.now()}`,
        agent_id: agentId,
        role: "user",
        timestamp: new Date().toISOString(),
        parts,
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
