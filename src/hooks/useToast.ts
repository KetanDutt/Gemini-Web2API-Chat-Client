import { toast as sonner } from 'sonner'

export const toast = {
  success: (message: string, description?: string) => sonner.success(message, { description }),
  error: (message: string, description?: string) => sonner.error(message, { description, duration: 6000 }),
  info: (message: string, description?: string) => sonner(message, { description }),
  message: (message: string, description?: string) => sonner.message(message, { description }),
}
