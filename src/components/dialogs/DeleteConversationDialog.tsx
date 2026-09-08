import { ConfirmDialog } from '@/components/ui/Dialog'
import { useUI } from '@/stores/uiStore'
import { useConversations } from '@/stores/conversationStore'
import { toast } from '@/hooks/useToast'

export function DeleteConversationDialog() {
  const id = useUI((s) => s.pendingConversationDelete)
  const requestDelete = useUI((s) => s.requestDelete)
  const conv = useConversations((s) => s.conversations.find((c) => c.id === id))
  const deleteConversation = useConversations((s) => s.deleteConversation)
  return (
    <ConfirmDialog
      open={!!id}
      onOpenChange={(o) => !o && requestDelete(null)}
      title="Delete conversation?"
      description={conv ? <>“{conv.title}” and all its messages will be permanently removed from this device.</> : undefined}
      confirmLabel="Delete"
      onConfirm={async () => {
        if (id) {
          await deleteConversation(id)
          toast.success('Conversation deleted')
        }
      }}
    />
  )
}
