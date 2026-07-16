const CACHE_NAME = "task-ai-v1";

const FILES = [
    "./",
    "./index.html",
    "./manifest.json"
];


self.addEventListener("install", event=>{
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache=>{
            return cache.addAll(FILES);
        })
    );
});


self.addEventListener("fetch", event=>{
    event.respondWith(
        caches.match(event.request)
        .then(response=>{
            return response || fetch(event.request);
        })
    );
});
