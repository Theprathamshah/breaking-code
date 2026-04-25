import type { Env, QueueMessage, OrderCreatedMessage } from '../../types'

/**
 * Queue consumer for Domain 2.
 *
 * Handles `order.created` messages by triggering the OrderLifecycleWorkflow.
 * The Workflow does the heavy lifting (agent assignment, route optimisation, etc.)
 * so this consumer is intentionally thin.
 */
export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      const body = msg.body

      if (body.type === 'order.created') {
        await handleOrderCreated(body, env)
        msg.ack()
      } else {
        // Messages for other consumers (D4, D5) land in their own queues;
        // any unknown type here is unexpected — ack to avoid DLQ noise.
        msg.ack()
      }
    } catch (err) {
      console.error('[D2 queue] Error processing message:', err)
      // Retry up to max_retries configured in wrangler.jsonc
      msg.retry()
    }
  }
}

async function handleOrderCreated(msg: OrderCreatedMessage, env: Env): Promise<void> {
  // Idempotency: if a workflow for this order is already running, creating
  // another with the same ID will throw — catch and treat as success.
  const workflowId = `wf-order-${msg.orderId}`

  try {
    await env.ORDER_LIFECYCLE_WORKFLOW.create({
      id: workflowId,
      params: {
        orderId: msg.orderId,
        tenantId: msg.tenantId,
        hubId: msg.hubId,
      },
    })
  } catch (err: unknown) {
    const isDuplicate =
      err instanceof Error &&
      (err.message.includes('already exists') || err.message.includes('duplicate'))

    if (!isDuplicate) throw err
    // Duplicate workflow — order is already being processed, safe to ack
  }
}
