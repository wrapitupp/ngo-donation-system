import { z } from 'zod'
import { logger } from '../utils/logger'
import { notifyAdmins } from './notification.service'

export const contactMessageSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(150),
  message: z.string().trim().min(10).max(2000),
})

export type ContactMessage = z.infer<typeof contactMessageSchema>

/**
 * Receive a contact message and put it in front of the administrators, as an
 * in-app notification plus email (system_announcement is an email event). The
 * form acknowledges with 202, so delivery has to reach a durable inbox: a log
 * line alone would lose an urgent report (say, a fraudulent campaign) on a host
 * with ephemeral storage. Best-effort by design, matching the rest of the
 * notification flow: a delivery failure is logged, never surfaced to the sender
 * as a failed submission.
 */
export async function submitContactMessage(message: ContactMessage): Promise<void> {
  logger.info(`Contact message from ${message.name} <${message.email}>: ${message.subject}`)

  try {
    await notifyAdmins(
      `Contact form: ${message.subject}`,
      `${message.name} (${message.email}) wrote:\n\n${message.message}`,
    )
  } catch (error) {
    logger.error('Failed to deliver contact message to administrators:', error)
  }
}
