export const NETWORK_STATUS_EVENT = 'cpclms-network-status';

export function reportNetworkStatus(online: boolean): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NETWORK_STATUS_EVENT, { detail: { online } }));
  }
}
