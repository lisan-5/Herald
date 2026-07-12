import { Queue } from "bullmq";
import type Redis from "ioredis";

export const DELIVERY_QUEUE_NAME = "delivery";

export type DeliveryJobData = {
  deliveryId: string;
  attemptNo: number;
};

export function createDeliveryQueue(connection: Redis): Queue<DeliveryJobData> {
  return new Queue<DeliveryJobData>(DELIVERY_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 1_000,
      removeOnFail: 5_000
    }
  });
}

export async function enqueueDelivery(
  queue: Queue<DeliveryJobData>,
  data: DeliveryJobData,
  delayMs = 0
) {
  await queue.add("deliver", data, {
    delay: delayMs,
    jobId: `${data.deliveryId}:${data.attemptNo}`
  });
}
