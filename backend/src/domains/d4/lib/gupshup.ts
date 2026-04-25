import gupshup, { type PostMsgFormDataParam, type PostMsgMetadataParam } from '@api/gupshup'
import type { Env } from '../../../types'

export interface SendCustomerMessageInput {
  phone: string | null
  text: string
}

export async function sendCustomerWhatsAppMessage(
  env: Env,
  input: SendCustomerMessageInput,
): Promise<boolean> {
  const apiKey = env.GUPSHUP_API_KEY?.trim()
  const appName = env.GUPSHUP_APP_NAME?.trim()
  const source = normalizePhoneNumber(env.GUPSHUP_SOURCE_NUMBER)
  const destination = normalizePhoneNumber(input.phone)

  if (!apiKey || !appName || source === null || destination === null) {
    return false
  }

  const body: PostMsgFormDataParam = {
    channel: 'whatsapp',
    source,
    destination,
    message: {
      type: 'text',
      text: input.text,
    },
    'src.name': appName,
  }

  const metadata: PostMsgMetadataParam = {
    'Content-Type': 'application/x-www-form-urlencoded',
    apikey: apiKey,
  }

  try {
    await gupshup.postMsg(body, metadata)
    return true
  } catch (error) {
    console.error('[Gupshup] sendCustomerWhatsAppMessage failed', error)
    return false
  }
}

function normalizePhoneNumber(phone: string): number | null {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null

  const numberValue = Number(digits)
  return Number.isSafeInteger(numberValue) ? numberValue : null
}