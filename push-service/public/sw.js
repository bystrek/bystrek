self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "bystrek", message: "" };
  event.waitUntil(
    self.registration.showNotification(data.title ?? "bystrek", {
      body: data.message ?? "",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
