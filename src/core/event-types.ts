export function matchesEventType(subscription: string, eventType: string): boolean {
  if (subscription === "*") {
    return true;
  }

  if (!subscription.includes("*")) {
    return subscription === eventType;
  }

  const escaped = subscription
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  return new RegExp(`^${escaped}$`).test(eventType);
}

export function matchesAnyEventType(subscriptions: readonly string[], eventType: string): boolean {
  return subscriptions.some((subscription) => matchesEventType(subscription, eventType));
}
