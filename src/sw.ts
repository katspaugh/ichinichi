/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

const SHARE_CACHE = "share-target";

// Handle Web Share Target POST requests.
// Must be registered before workbox routes so it gets first crack at fetch events.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.searchParams.has("share-target") && event.request.method === "POST") {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request: Request): Promise<Response> {
  const formData = await request.formData();
  const files = formData.getAll("images");

  if (files.length > 0) {
    const cache = await caches.open(SHARE_CACHE);
    // Clear old shared images
    const keys = await cache.keys();
    await Promise.all(keys.map((key) => cache.delete(key)));

    for (const file of files) {
      if (file instanceof File) {
        const response = new Response(file, {
          headers: {
            "Content-Type": file.type,
            "X-Filename": file.name,
          },
        });
        await cache.put(`/shared-image/${Date.now()}-${file.name}`, response);
      }
    }
  }

  // Redirect to the app with share-target flag (GET).
  // The app will read files from cache and insert them into today's note.
  const url = new URL(request.url);
  url.search = "?share-target";
  return Response.redirect(url.toString(), 303);
}

// Allow the app to trigger skipWaiting for prompt-based updates
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Workbox precaching + SPA navigation fallback
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const navigationHandler = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api/],
  }),
);
