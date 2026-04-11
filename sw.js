/**
 * 🕋 Service Worker لتطبيق "المصحف المرتل | صفاء الروح"
 * استراتيجية: Cache-First للأصول الثابتة، مع دعم التحميل المسبق للسور
 */

const CACHE_NAME = 'safaa-quran-v2.0';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&display=swap',
    'https://i.postimg.cc/05cL5zw5/20260405-135743.png',
    'https://i.postimg.cc/zvS6s80G/IMG-20260404-200653.jpg'
];

// 📦 قائمة السور للتخزين المؤقت الاختياري (يمكن تفعيلها حسب الحاجة)
const SURAH_CACHE_LIMIT = 10; // عدد السور التي يتم تخزينها مسبقاً
const surahUrls = [];
for (let i = 1; i <= 114; i++) {
    const num = i.toString().padStart(3, '0');
    surahUrls.push(`https://server12.mp3quran.net/maher/${num}.mp3`);
}

// 🔄 التثبيت: تخزين الأصول الأساسية
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('✅ فتح الكاش:', CACHE_NAME);
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                // تخزين أول 10 سور للاستماع السريع دون إنترنت
                console.log('🎵 جاري تخزين السور الأولى مسبقاً...');
                return caches.open(CACHE_NAME).then(cache => {
                    const promises = surahUrls.slice(0, SURAH_CACHE_LIMIT).map(url => 
                        fetch(url, { mode: 'no-cors' })
                            .then(response => cache.put(url, response))
                            .catch(() => {}) // تجاهل الأخطاء للتحميل الخلفي
                    );
                    return Promise.all(promises);
                });
            })
            .then(() => self.skipWaiting())
            .catch((err) => console.log('❌ فشل التخزين:', err))
    );
});

// 🗑️ التنشيط: حذف الكاش القديمself.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('🗑️ حذف الكاش القديم:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// 🌐 اعتراض الطلبات وتطبيق الاستراتيجية
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    // Cache-First للخطوط والصور وCSS وJS
    if (url.href.includes('fonts.googleapis') || 
        url.href.includes('font-awesome') ||
        url.href.includes('postimg') ||
        url.pathname.endsWith('.css') || 
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.png') || 
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.svg')) {
        
        event.respondWith(
            caches.match(request)
                .then((cached) => {
                    if (cached) return cached;
                    return fetch(request)
                        .then((response) => {
                            if (response.ok) {
                                const clone = response.clone();
                                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                            }
                            return response;
                        })
                        .catch(() => {
                            // Fallback للصورة أو الخط من الكاش
                            return caches.match(request);
                        });
                })
        );
        return;    }

    // Network-First لملفات MP3 مع fallback للكاش
    if (url.pathname.endsWith('.mp3') || url.href.includes('mp3quran')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Network-First للصفحة الرئيسية مع fallback
    if (request.destination === 'document' || url.pathname === '/' || url.pathname.endsWith('index.html')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    // الاستراتيجية الافتراضية: Cache-First
    event.respondWith(
        caches.match(request)
            .then((cached) => cached || fetch(request).catch(() => {
                if (request.destination === 'document') {
                    return caches.match('/index.html');
                }
            }))
    );
});

// 📡 التعامل مع رسائل من الصفحة الرئيسية
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }    if (event.data?.type === 'CACHE_SURAH' && event.data.url) {
        event.waitUntil(
            caches.open(CACHE_NAME)
                .then(cache => fetch(event.data.url)
                    .then(response => cache.put(event.data.url, response))
                    .catch(() => {})
                )
        );
    }
    if (event.data?.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
        event.waitUntil(
            caches.open(CACHE_NAME).then(cache => cache.addAll(event.data.urls))
        );
    }
});

// 🔔 إشعارات الخلفية (اختياري)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: '/icon-192.png',
            badge: '/icon-72.png',
            vibrate: [200, 100, 200],
            data: { url: data.url }
        };
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

console.log('🕋 Service Worker لـ "المصحف المرتل | صفاء الروح" جاهز للعمل');
