const CACHE_NAME = "task-ai-v2";

const FILES = [
    "./",
    "./index.html",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png"
];

self.addEventListener("install", event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => cache.addAll(FILES))
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
});

// ============== IndexedDB 辅助（和 index.html 里的逻辑保持一致，两边各自独立读写同一份数据库）==============
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

// ============== 核心：检查任务是否到点，到点就发系统通知 ==============
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
                tag: key
            });
        }
    }
    if (changed) {
        await idbPut('notifiedLog', notifiedLog);
    }
}

// 浏览器在背景不定期唤醒（仅部分安卓设备安装为PWA后生效，间隔由浏览器决定）
self.addEventListener('periodicsync', event => {
    if (event.tag === 'task-periodic-check') {
        event.waitUntil(checkAndNotify());
    }
});

// 页面切到后台时注册的一次性同步，作为补充触发手段
self.addEventListener('sync', event => {
    if (event.tag === 'task-check-once') {
        event.waitUntil(checkAndNotify());
    }
});

// 点击通知时，聚焦或打开 App
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('./');
        })
    );
});
