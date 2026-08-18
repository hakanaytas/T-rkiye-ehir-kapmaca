# 🇹🇷 Türkiye Fetih — v1

Gerçek zamanlı, çok oyunculu Türkiye il fethetme stratejisi. HTML5 + SVG + CSS + JavaScript + Firebase (Firestore/Auth). Ağır kütüphane yok (3D/WebGL/Canvas efekti yok).

## Nasıl çalıştırılır

Bu bir static site — build aracı yok. GitHub Pages'e olduğu gibi yüklenebilir ya da yerelde basit bir static server ile açılabilir (Firebase Auth `file://` üzerinden çalışmaz, bir HTTP sunucusu gerekir):

```bash
npx serve .
# veya
python3 -m http.server 8080
```

## Mimari kararlar (neden böyle yapıldı)

- **Gerçek harita verisi, statik olarak gömülmedi.** 81 ilin tam çözünürlüklü GeoJSON sınır verisi ~236KB ve binlerce koordinat içeriyor. Bunu koda gömmek yerine `js/map.js`, oyunun içinde tarayıcıda çalışırken gerçek veriyi CDN'den (`alpers/Turkey-Maps-GeoJSON`, jsDelivr üzerinden) çeker ve haritayı **bir kez** oluşturur. Bu hem "haritayı uydurma, gerçek GeoJSON kullan" kuralına tam uyar hem de repoyu şişirmez. İnternet olmadan ilk yükleme çalışmaz; bu normal bir harita uygulaması davranışıdır ve service worker sonraki ziyaretlerde dosyayı cache'ler.
- **Kaynak üretimi "lastUpdate" deltasıyla hesaplanır ama her saniye Firestore'a yazılmaz.** Ekranda anlık interpolasyon yapılır (`economy.js#getDisplayResources`), gerçek yazma yalnızca bir eylem (bina yükseltme, saldırı, il alma) olduğunda "flush" edilir. Her saniye tüm oyuncular için Firestore yazması hem maliyetli hem de performans hedefiyle çelişir; bu yaklaşım aynı matematiği (geçen süre × üretim) korur.
- **Komşuluk verisi elle çıkarılmış bir kenar listesi** (`provinces-data.js`). Coğrafi olarak doğru ama production'a geçmeden önce `turf.js booleanIntersects` ile GeoJSON üzerinden otomatik doğrulanması önerilir — bazı kenarlarda (özellikle Doğu/Güneydoğu Anadolu'da) küçük hatalar olabilir.
- **Güvenlik:** v1 client-authoritative'dir (Firestore transaction'larla yazılıyor, `firestore.rules` temel kontrolleri yapıyor). Tam hile-korumalı bir sistem için savaş/kaynak hesaplamalarının bir Cloud Function'a taşınması gerekir (spec'te "gerekiyorsa Cloud Functions" olarak belirtilmişti — v1 bu adımı ertelemiştir).

## Firebase kurulumu (yapman gerekenler)

1. Firebase Console → Authentication → **Anonymous** sign-in yöntemini etkinleştir.
2. Firestore Database oluştur (production mode), `firestore.rules` dosyasındaki kuralları yükle.
3. `js/firebase-config.js` içindeki bağlantı bilgileri zaten senin projene (`nokey-35c2f`) bağlı — değiştirmene gerek yok.

## Dosya yapısı

```
index.html          Tüm ekranlar (giriş, harita, paneller)
css/style.css        Beyaz+siyah temel tasarım, durum renkleri
js/firebase-config.js  Firebase init (DOKUNMA)
js/provinces-data.js   81 il, plaka kodları, komşuluk grafiği, bina tanımları
js/map.js              Gerçek GeoJSON'dan SVG harita (bir kez çizilir)
js/economy.js          Kaynak üretimi, bina yükseltme, il alma
js/war.js               Saldırı formülü, fetih/işgal durum makinesi
js/alliance.js          İttifak kurma/davet/kabul/ayrılma
js/chat.js               Gerçek zamanlı sohbet
js/notifications.js      Bildirim yazma/dinleme/toast
js/leaderboard.js        Sıralama hesaplama
js/main.js                Her şeyi birbirine bağlayan orkestratör
manifest.json / sw.js     PWA
firestore.rules            Temel güvenlik kuralları
```

## v1 kapsamı (spec'teki "İlk sürüm" listesi)

✅ Firebase giriş (anonim + kullanıcı adı) · ✅ Gerçek 81 il haritası · ✅ İl seçme/alma ·
✅ Kaynak üretimi · ✅ Asker/bina sistemi · ✅ Komşuluk kontrolü · ✅ Savaş (formül + rastgele katsayı) ·
✅ Fetih/işgal/entegrasyon döngüsü · ✅ İttifak (kurma/davet/kabul/ayrılma) · ✅ Gerçek zamanlı sohbet ·
✅ Bildirim sistemi (toast + merkez) · ✅ PC geniş ekran · ✅ Mobil yatay ekran uyarısı · ✅ PWA

## Sırada ne var (v1 sonrası, spec'te belirtildiği gibi)

- Teknoloji ağacı, casusluk, komutan sistemi, pazar
- Komşuluk verisinin GIS ile otomatik doğrulanması
- Savaş/ekonominin Cloud Functions'a taşınması (anti-cheat)
- Kaynak gönderme / asker desteği gönderme (ittifak içi)
- Ateşkes teklifi akışı (şu an sadece ittifaktan ayrılınca otomatik 30dk ateşkes var)

## Deploy notu (senin diğer projene benzer şekilde)

`sw.js` cache-first çalışıyor — **her deploy'da `CACHE_VERSION` değerini artır**, aksi halde kullanıcılar eski sürümü görmeye devam eder (Pişti Vermez projesindeki aynı davranış).
