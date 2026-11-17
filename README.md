# Kinetix — Premiere Pro Mask to Transform

**[Türkçe](#türkçe) · [English](#english) · [العربية](#العربية)**

> **2 Tık / 0 AE** · **2 Clicks / 0 AE** · **نقرتان / 0 AE**  
> Adobe Premiere Pro 2026 (v26.0+) & CEP 11/12 için açık kaynak, %100 çevrimdışı ve ücretsiz yerel maske-dönüştürme eklentisi.

---

## Türkçe

**Kinetix**, Adobe Premiere Pro'nun dahili maske ve yapay zeka nesne izleme (*Opacity Mask*, *AI Object Mask / `.prmf`*) verilerini After Effects / Dynamic Link'e geçmeden doğrudan zaman çizelgesi üzerindeki metin, grafik, Adjustment Layer veya video katmanlarının yerleşik **Transform**, **Motion** ve **Corner Pin** anahtar karelerine dönüştüren yerel bir CEP panel uzantısıdır.

### Özellikler
- **2D Nesne ve Metin Sabitleme (Pinning):** Maske hareketinden Procrustes/Kabsch 2D hizalama ile `Position`, `Scale` ve `Rotation` anahtar kareleri üretir.
- **Perspektif ve 2D Ekran Değiştirme (Corner Pin):** 4 köşeli `[TL, TR, BR, BL]` düzlemsel yüzey takibini yerleşik `Corner Pin` (`AE.ADBE Corner Pin`) efektine yazar.
- **Tersine Stabilizasyon (`Stabilize`):** İzlenen hareket vektörlerini tersine çevirerek `(-X, -Y)` özneyi kadraj merkezine kilitler.
- **Premiere Pro 2026 AI Object Mask Desteği:** ExtendScript DOM'a ek olarak proje yanındaki `.prmf` ikili maske önbelleklerini ve `.prproj` XML verilerini çevrimdışı okur.
- **Çok Dilli Arayüz:** Panel içinden tek tıkla **Türkçe (TR)**, **İngilizce (EN)** ve **Arapça (AR - RTL)** arasında geçiş yapılabilir.
- **Sıfır Eklenti Bağımlılığı:** Standart Premiere Pro anahtar kareleri üretir; `.prproj` dosyaları Kinetix yüklü olmayan bilgisayarlarda sorunsuz açılır.

### Kolay Kurulum
1. Bu depoyu indirin (**Code → Download ZIP** veya `git clone`).
2. **macOS:** Klasör içindeki **`Kurulum_Mac.command`** dosyasına çift tıklayın (CEP `PlayerDebugMode` ayarını açar ve eklentiyi otomatik kurar).
3. **Windows (10/11):** Klasör içindeki **`Kurulum_Windows.bat`** dosyasına çift tıklayın.
4. Premiere Pro'yu yeniden başlatıp **`Window > Extensions > Kinetix`** menüsünden paneli açın.

### Kullanım
1. Kaynak klipte *Effect Controls* üzerinden maskenizi oluşturup ileri doğru izleyin (*Track Mask*).
2. Kinetix panelinde **`Load Premiere Mask`** butonuna basın.
3. Hedef katmanı seçip **`Apply Tracking`** veya **`Stabilize (-X, -Y)`** komutunu verin.

---

## English

**Kinetix** is an open-source, 100% offline, zero-dependency Adobe CEP extension for **Adobe Premiere Pro 2026 (v26.0+)** and CEP 11/12. It converts Premiere Pro's built-in mask tracking and AI Object Mask (`.prmf`) data directly into native **Transform**, **Motion**, and **Corner Pin** keyframes—without launching After Effects or Dynamic Link.

### Features
- **2D Motion Tracking & Pinning:** Computes `Position`, `Scale`, and `Rotation` keyframes via 2D Procrustes/Kabsch alignment.
- **4-Point Perspective (Corner Pin):** Maps 4-corner planar surfaces `[TL, TR, BR, BL]` directly to Premiere Pro's native `Corner Pin` (`AE.ADBE Corner Pin`) effect.
- **Inverse Stabilization (`Stabilize`):** Inverts tracked motion vectors `(-X, -Y)` to lock a moving subject to the center of the frame.
- **Premiere Pro 2026 AI Object Mask Support:** Reads ExtendScript mask paths as well as binary `.prmf` mask caches and `.prproj` XML files completely offline.
- **Multilingual UI:** Instant switching between **Turkish (TR)**, **English (EN)**, and **Arabic (AR with RTL)** right from the panel header.
- **Zero Plugin Dependency:** Writes standard native keyframes; `.prproj` files open cleanly on machines without Kinetix installed.

### Easy Installation
1. Download this repository (**Code → Download ZIP** or `git clone`).
2. **macOS:** Double-click **`Kurulum_Mac.command`** (enables CEP `PlayerDebugMode` and installs into Adobe CEP `extensions`).
3. **Windows (10/11):** Double-click **`Kurulum_Windows.bat`**.
4. Restart Premiere Pro and open **`Window > Extensions > Kinetix`**.

### Usage
1. Create and track your mask forward in *Effect Controls*.
2. Click **`Load Premiere Mask`** in the Kinetix panel.
3. Select your target layer on the timeline and click **`Apply Tracking`** or **`Stabilize (-X, -Y)`**.

---

## العربية

**Kinetix** هو إضافة مفتوحة المصدر وتعمل **100% دون اتصال بالإنترنت** لبرنامج **Adobe Premiere Pro 2026 (v26.0+)** وCEP 11/12. تقوم بتحويل بيانات تتبع الأقنعة وتتبع الكائنات بالذكاء الاصطناعي (`.prmf`) مباشرةً إلى إطارات مفتاحية أصلية في تأثيرات **Transform** و**Motion** و**Corner Pin** دون الحاجة إلى فتح After Effects أو استخدام Dynamic Link.

### المميزات
- **تتبع الحركة وتثبيت النصوص والرسومات (2D Pinning):** حساب `Position` و`Scale` و`Rotation` بدقة عبر خوارزمية Procrustes ثنائية الأبعاد.
- **تثبيت الزوايا والمنظور (Corner Pin):** تحويل المسطحات رباعية الزوايا إلى تأثير `Corner Pin` المدمج لاستبدال الشاشات.
- **التثبيت العكسي (`Stabilize`):** عكس متجهات الحركة `(-X, -Y)` لتثبيت العنصر المتحرك في منتصف الإطار.
- **دعم Premiere Pro 2026 AI Object Mask:** قراءة ملفات `.prmf` الثنائية وملفات `.prproj` XML محلياً دون أي خوادم خارجية.
- **واجهة متعددة اللغات:** يدعم التبديل الفوري بين **التركية (TR)** و**الإنجليزية (EN)** و**العربية (AR - من اليمين لليسار RTL)**.
- **بدون أي إضافات خارجية:** يكتب إطارات مفتاحية قياسية، فتعمل ملفات `.prproj` على أي جهاز حتى بدون تثبيت الإضافة.

### التثبيت السهل
1. قم بتنزيل المستودع (**Code → Download ZIP** أو `git clone`).
2. **macOS:** انقر نقراً مزدوجاً على **`Kurulum_Mac.command`**.
3. **Windows (10/11):** انقر نقراً مزدوجاً على **`Kurulum_Windows.bat`**.
4. أعد تشغيل Premiere Pro وافتح اللوحة من **`Window > Extensions > Kinetix`**.

### طريقة الاستخدام
1. أنشئ القناع وتتبّعه للأمام من لوحة *Effect Controls*.
2. اضغط على **`تحميل قناع Premiere`** داخل لوحة Kinetix.
3. حدد الطبقة المستهدفة على الخط الزمني واضغط **`تطبيق التتبع`** أو **`تثبيت (-X, -Y)`**.

---

## Tests & License

```bash
node --test tests/kinetix.test.js
```

Released under the [MIT License](LICENSE).
