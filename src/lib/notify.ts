import type { Alert } from '../types';

export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestBrowserPermission(): Promise<NotificationPermission> {
  if (!browserNotificationsSupported()) return 'denied';
  return Notification.permission === 'default' ? Notification.requestPermission() : Notification.permission;
}

export function notifyBrowser(alert: Alert) {
  if (!browserNotificationsSupported() || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
  try {
    const n = new Notification(`$${alert.symbol} · ${alert.title}`, { body: alert.message, tag: alert.id, silent: true });
    n.onclick = () => {
      window.focus();
      window.location.assign(`/alerts/${alert.id}`);
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
