const CACHE_NAME = "task-ai-v3";

const FILES = [
    "./",
    "./index.html",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png"
];

self.addEventListener("install", event => {
    self.skipWaiting();
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)));
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
    event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});

// ============== 【新增】接收 Supabase 发来的真正后台 push 推送 ==============
self.addEventListener('push', event => {
    let data = { title: 'Toast · 任务提醒', body: '你有一个任务到点啦！' };
    try {
        if (event.data) data = event.data.json();
    } catch (e) {
        if (event.data) data.body = event.data.text();
    }
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-192.png',
            vibrate: [300, 100, 300, 100, 300]
        })
    );
});
// ============== 结束 ==============

const IDB_NAME = 'toastDB';
const IDB_STORE = 'kv';
function idbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(IDB_STORE)) {
                req.result.createObjectStore(IDB_STORE, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function idbGet(key) {
    try {
        const db = await idbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
            req.onerror = () => reject(req.error);
        });
    } catch (e) { return undefined; }
}
async function idbPut(key, value) {
    try {
        const db = await idbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put({ key, value });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) { return false; }
}

async function checkAndNotify() {
    const tasks = (await idbGet('tasks')) || [];
    const aiInfo = (await idbGet('aiInfo')) || { name: 'Toast', avatar: 'icons/icon-192.png' };
    let notifiedLog = (await idbGet('notifiedLog')) || {};
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let changed = false;
    for (const task of tasks) {
        if (task.h === null || task.h === undefined) continue;
        const taskMinutes = task.h * 60 + task.m;
        const key = task.id + '-' + dateStr + '-' + task.h + '-' + task.m;
        if (nowMinutes >= taskMinutes && !notifiedLog[key]) {
            notifiedLog[key] = true;
            changed = true;
            const timeStr = task.h + ':' + (task.m < 10 ? '0' + task.m : task.m);
            await self.registration.showNotification(aiInfo.name + ' · 任务提醒', {
                body: timeStr + ' ' + task.content + ' 到点啦，快去完成吧！',
                icon: aiInfo.avatar || 'icons/icon-192.png',
                badge: 'icons/icon-192.png',
                vibrate: [300, 100, 300, 100, 300],
                tag: key
            });
        }
    }
    if (changed) await idbPut('notifiedLog', notifiedLog);
}

self.addEventListener('periodicsync', event => {
    if (event.tag === 'task-periodic-check') event.waitUntil(checkAndNotify());
});
self.addEventListener('sync', event => {
    if (event.tag === 'task-check-once') event.waitUntil(checkAndNotify());
});
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) if ('focus' in client) return client.focus();
            if (clients.openWindow) return clients.openWindow('./');
        })
    );
});
