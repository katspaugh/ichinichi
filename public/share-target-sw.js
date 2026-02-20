// Web Share Target handler.
// Loaded via importScripts in the workbox-generated service worker.
// Registered before workbox routes so share-target POSTs are handled first.

var SHARE_CACHE = "share-target";

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  if (
    url.searchParams.has("share-target") &&
    event.request.method === "POST"
  ) {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request) {
  var formData = await request.formData();
  var files = formData.getAll("images");

  if (files.length > 0) {
    var cache = await caches.open(SHARE_CACHE);
    var keys = await cache.keys();
    await Promise.all(keys.map(function (key) { return cache.delete(key); }));

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file instanceof File) {
        var response = new Response(file, {
          headers: {
            "Content-Type": file.type,
            "X-Filename": file.name,
          },
        });
        await cache.put("/shared-image/" + Date.now() + "-" + file.name, response);
      }
    }
  }

  var url = new URL(request.url);
  url.search = "?share-target";
  return Response.redirect(url.toString(), 303);
}
