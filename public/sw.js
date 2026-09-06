self.addEventListener(
  'push',
  event => {
    let data = {};

    try {
      data = event.data
        ? event.data.json()
        : {};
    } catch {
      data = {
        title:
          'Гос.Маг.Услуги',
        body:
          event.data
            ? event.data.text()
            : '',
      };
    }

    const title =
      data.title ||
      'Гос.Маг.Услуги';

    const options = {
      body:
        data.body || '',
      icon:
        data.icon ||
        '/icons/push-192.png',
      badge:
        data.badge ||
        '/icons/push-192.png',
      tag:
        data.tag ||
        'gosmag-update',
      timestamp:
        data.timestamp ||
        Date.now(),
      data: {
        url:
          data.url || '/',
      },
    };

    event.waitUntil(
      self.registration
        .showNotification(
          title,
          options
        )
    );
  }
);


self.addEventListener(
  'notificationclick',
  event => {
    event.notification.close();

    const requested =
      event.notification?.data?.url ||
      '/';

    const targetUrl =
      new URL(
        requested,
        self.location.origin
      ).href;

    event.waitUntil(
      clients
        .matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        .then(windowClients => {
          for (const client of windowClients) {
            try {
              if (
                new URL(client.url).origin ===
                self.location.origin
              ) {
                client.navigate(targetUrl);
                return client.focus();
              }
            } catch (_) {}
          }

          return clients.openWindow(
            targetUrl
          );
        })
    );
  }
);
