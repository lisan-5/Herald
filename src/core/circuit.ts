export type EndpointCircuitStatus = "active" | "paused" | "disabled_by_breaker";

export type CircuitState = {
  status: EndpointCircuitStatus;
  consecutiveFailures: number;
};

export const CIRCUIT_BREAKER_THRESHOLD = 20;

export function recordDeliverySuccess(state: CircuitState): CircuitState {
  if (state.status === "paused") {
    return { ...state, consecutiveFailures: 0 };
  }

  return {
    status: "active",
    consecutiveFailures: 0
  };
}

export function recordDeliveryFailure(state: CircuitState): CircuitState {
  if (state.status === "paused") {
    return state;
  }

  const consecutiveFailures = state.consecutiveFailures + 1;

  return {
    status:
      consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD ? "disabled_by_breaker" : state.status,
    consecutiveFailures
  };
}

export function shouldAttemptDelivery(state: CircuitState): boolean {
  return state.status === "active";
}
