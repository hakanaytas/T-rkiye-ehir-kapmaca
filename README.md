# Canlı Türkiye Haritası — Sosyal Oyun

HTML5 + CSS + JavaScript (Firebase destekli), mobil öncelikli, sosyal ve eğlenceli bir
Türkiye haritası oyunu. Karmaşık strateji/ekonomi sistemi **yoktur** — amaç, illere
bölünüp sohbet etmek, emoji/nesne göndermek ve komşu (ya da herhangi bir) ile
eğlenceli, anında sonuçlanan "saldırılar" düzenlemektir.

## Özellikler

- **81 il, gerçek zamanlı harita**: Gerçek GeoJSON sınırlarından çizilen, dokunmatik
  pan/zoom destekli SVG harita. İl renkleri Firestore'daki değişikliklere göre
  anlık güncellenir.
- **İl seçimi / ekip kurma**: Bir oyuncu istediği ili "ana il" olarak seçer. Aynı ili
  birden fazla oyuncu seçebilir.
- **Geçici il sohbeti**: Her ilin kendi sohbet odası vardır. Mesajlar **kalıcı
  arşivlenmez** — 24 saatlik (isteğe göre 1 saatlik) "oturum dönemi" mantığıyla
  çalışır; dönem değişince oda otomatik olarak sıfırlanmış gibi davranır
  (`firebase-config.js` içindeki `ROOM_TTL_MS`).
- **Emoji/nesne gönderme**: 🍉🍌🍕💣🔥❤️😂😎👑⚡ — sohbete düşer *ve* haritada
  seçili ilin üzerinde kısa süreli, uçuşan bir animasyonla belirir.
- **Saldırı sistemi**: Oyuncu, ana ilinden hedef ile "Saldır" der. Harita üzerinde
  kısa bir uçuş animasyonu + patlama efekti oynar, hedef il geçici olarak
  saldıranın rengine boyanır ve büyük "◯◯◯ ELE GEÇİRİLDİ!" bildirimi çıkar.
  Asker, kaynak veya ekonomi hesabı **yoktur** — tamamen anlık ve eğlence amaçlıdır.
- **Geçici etiketler**: Ele geçirilen ilin üzerinde birkaç saniyeliğine ekibin adı
  (ör. "Hakan'ın Ekibi") görünür, sonra kaybolur. Kalıcı değildir.
- **Mobil öncelikli, PWA**: Ana ekrana eklenebilir, service worker ile temel
  önbellekleme yapılır (sohbet/veri her zaman ağdan taze çekilir).

## Dosya yapısı

Tüm dosyalar tek klasörde (alt klasör yok):

```
index.html            Ana sayfa / iskelet
style.css             Tüm görsel tasarım ve animasyonlar
manifest.json          PWA manifesti
sw.js                  Service worker (statik dosya önbelleği)
firestore.rules        Firestore güvenlik kuralları
firebase-config.js     Firebase bağlantısı + ortak sabitler (DEĞİŞTİRMEYİN)
provinces-data.js      81 ilin adı/plaka kodu + komşuluk verisi
map.js                 GeoJSON'dan SVG harita çizimi, pan/zoom, renk/etiket yardımcıları
main.js                Uygulama orkestrasyonu (auth, panel, olaylar)
attack.js              Saldırı / geçici ele geçirme mantığı
chat.js                Geçici, oturum tabanlı il sohbeti
reactions.js           Emoji/nesne gönderme ve harita animasyon tetikleyicisi
notifications.js       Toast ve büyük banner bildirimleri
icon-192.png / icon-512.png   Uygulama ikonu / favicon
```

## Firestore veri modeli

- `players/{uid}` — `{ name, color, teamLabel, provinceId, lastSeen }`
- `provinces/{id}` — `{ capturedByUid, capturedByName, color, label, expiresAtClient, ... }`
  (yoksa il "sahipsiz" sayılır; `expiresAtClient` geçmişse istemci onu nötr kabul eder)
- `provinces/{id}/messages/{msgId}` — `{ uid, name, text, kind, session, ts }`
  (sadece güncel `session` sorgulanır → eski mesajlar görünmez)
- `attacks/{id}` — kısa ömürlü olay kaydı; sadece animasyon/bildirim tetiklemek için
- `reactions/{id}` — gönderen birkaç saniye içinde kendi kaydını siler

Kurallar `firestore.rules` dosyasındadır; Firebase Console → Firestore Database →
Rules sekmesine yapıştırın ya da `firebase deploy --only firestore:rules` ile
dağıtın.

## Notlar

- Harita verisi `alpers/Turkey-Maps-GeoJSON` deposundan (jsDelivr CDN) tarayıcıda
  çekilir; internet bağlantısı gerektirir.
- `firebase-config.js` içindeki bağlantı bilgileri değiştirilmemelidir.
- Basit bir sosyal oyun olduğu için saldırı/ele geçirme mantığı istemci taraflıdır
  (client-authoritative). Kötüye kullanımı tamamen engellemek isterseniz Cloud
  Functions ile sunucu taraflı doğrulama eklenebilir; bu proje kasıtlı olarak
  hafif tutulmuştur.
- `provinces/{id}/messages` sorgusu (`where session ==` + `orderBy ts`) bileşik
  bir Firestore dizini gerektirir. İlk çalıştırmada tarayıcı konsolunda
  Firebase'in verdiği "index oluştur" bağlantısına tıklamanız yeterlidir
  (otomatik önerilen composite index'i tek tıkla oluşturur).
