// EryAI Dashboard Service Worker
const CACHE_NAME = 'eryai-dashboard-v1';

// Install - cache basic assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim());
});

// Push notification received
self.addEventListener('push', (event) => {
  console.log('Push received:', event);
  
  let data = {
    title: 'EryAI',
    body: 'Du har ett nytt meddelande',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    data: {}
  };
  
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/icon-96x96.png',
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Öppna' },
      { action: 'close', title: 'Stäng' }
    ],
    requireInteraction: true,
    tag: data.tag || 'eryai-notification'
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click - open the chat
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();
  
  if (event.action === 'close') return;
  
  const sessionId = event.notification.data?.sessionId;
  const url = sessionId 
    ? `/chat/${sessionId}` 
    : '/dashboard';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if open
        for (const client of clientList) {
          if (client.url.includes('/dashboard') || client.url.includes('/chat')) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open new window
        return clients.openWindow(url);
      })
  );
});
