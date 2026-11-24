# Assetto Corsa Docker Çoklu Sunucu & Yönetim Paneli

Tek bir **Linux VDS** üzerinde **Docker** içinde çalışan, **`5829`** portundan IP ile erişilen çoklu Assetto Corsa sunucu yönetim paneli ve oyuncu mod indirme portalıdır.

## Öne Çıkan Özellikler

- **Seçilebilir Sunucu Motoru:** Her sunucu oluşturulurken **AssettoServer** (AI Trafik, CSP Extra Options, Shutoko / Freeroam) veya **Vanilla Kunos `acServer`** (Klasik Yarış / Drift) seçebilirsiniz.
- **Manuel Port Yönetimi & İzole Container:** Her sunucu kendi izole Docker container'ında çalışır; UDP, TCP ve HTTP portlarını siz belirlersiniz. Panel port çakışmalarını engeller ve kopyalanabilir `ufw` güvenlik duvarı komutunu üretir.
- **Oyuncu Davet Linki & Doğrudan Mod İndirme Portalı (`/join/<sunucu>`):**
  - Her sunucu için şifresiz paylaşılabilir davet sayfası + direkt `acmanager://` bağlanma linki üretilir.
  - Sayfada sunucudaki harita, tüm arabalar ve pack'ler sürüm/SHA-256 doğrulama koduyla listelenir.
  - Oyuncu herhangi bir modun üzerine tıkladığında doğrudan sizin VDS'inizden Content Manager'a sürükle-bırak uyumlu `.zip` olarak indirir — sürüm uyuşmazlığı sıfırlanır.
  - İsterse **"Tüm Modları İndir (.ZIP)"** butonuyla harita + tüm arabaları tek pakette indirir.
  - Orijinal Kunos içerikleri *"Oyunla Gelir (İndirmeye Gerek Yok)"* olarak işaretlenebilir.
- **Harita, Araba ve Pack Yöneticisi:**
  - Tarayıcıdan `.zip`, `.7z`, `.rar`, `.tar.gz` yükleme veya URL'den doğrudan VDS hızıyla indirme.
  - Büyük klasörleri SFTP ile `/opt/ac-panel/data/library/cars` veya `tracks` içine atıp panelden **"Klasörü Yeniden Tara"** diyerek anında ekleme.
  - Birden fazla Pack oluşturup tek tıkla yeni sunuculara bağlama.
- **Canlı İzleme & Yönetim:** Canlı WebSocket konsol logları, anlık bağlı oyuncu listesi, ham konfigürasyon editörü (`server_cfg.ini`, `entry_list.ini`, `extra_cfg.yml`, `csp_extra_options.ini`), hazır sunucu şablonları ve sunucu klonlama.

---

## Linux VDS Kurulumu (Ubuntu / Debian)

1. Projeyi GitHub'dan klonlayın ve kurulum betiğini çalıştırın:
   ```bash
   git clone https://github.com/zahit5834/assettocorsa-docker-panel.git /opt/ac-panel
   cd /opt/ac-panel
   sudo bash install.sh
   ```
2. Kurulum betiği Docker'ı kurar, VDS genel IP'nizi algılar, `.env` dosyasını oluşturur, `5829` portunu açar ve tüm servisleri başlatır.
3. Kurulum bitince tarayıcıdan erişin:
   ```text
   http://<VDS_IP_ADRESINIZ>:5829
   ```

### Güncelleme (Panelden veya Terminalden)

- **Panelden Tek Tıkla:** **Ayarlar & Motorlar → Uygulama Güncelleme (GitHub) → Uygulamayı Güncelle** butonuna basın. Çalışan Assetto Corsa sunucularınız etkilenmeden panel güncellenip yeniden başlar.
- **SSH / Terminalden:**
  ```bash
  cd /opt/ac-panel
  sudo bash update.sh
  ```

### Manuel Başlatma
```bash
cp .env.example .env
# .env içinde VDS_PUBLIC_IP, ADMIN_PASSWORD, HOST_PROJECT_DIR ve HOST_DATA_DIR değerlerini düzenleyin
docker compose --profile build-vanilla build vanilla-ac-builder
docker compose up -d --build
```

---

## Vanilla Kunos `acServer` Kurulumu (Opsiyonel)

AssettoServer ilk başlatmada otomatik olarak çalışır. **Vanilla Kunos `acServer`** motorunu da kullanmak isterseniz iki kolay yöntem vardır:

1. **En Kolay Yöntem (Panelden Yükle):** Bilgisayarınızda Steam'in kurulu olduğu yerdeki `steamapps/common/assettocorsa/server/acServer` (uzantısız Linux dosyası) dosyasını **Panel → Ayarlar & Motorlar → Vanilla Kunos acServer** alanından yükleyin.
2. **VDS Üzerinde SteamCMD ile İndir:**
   ```bash
   sudo bash scripts/fetch-acserver.sh
   ```

---

## Port ve Güvenlik Duvarı (UFW)

- Panel portu: **`5829/tcp`**
- Oluşturduğunuz her Assetto Corsa sunucusu için seçtiğiniz **UDP**, **TCP** ve **HTTP** portlarını açmanız gerekir. Panel her sunucu kartında kopyalanabilir `sudo ufw allow ...` komutunu otomatik olarak gösterir.

## SFTP ile Büyük Mod / Harita Yükleme

Çok büyük haritaları (ör. 4 GB+) tarayıcı yerine SFTP/SCP ile doğrudan:
- Haritalar: `<proje>/data/library/tracks/<harita_klasoru>`
- Arabalar: `<proje>/data/library/cars/<araba_klasoru>`

konumlarına kopyalayıp ardından panelde **Harita & Arabalar → Klasörü Yeniden Tara (SFTP)** butonuna basabilirsiniz.
