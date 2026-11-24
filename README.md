# Zortex

Parametrik snippet destekli, 2 veya 4 parçaya bölünebilen, **Windows ve macOS** için portable terminal.

<img src="build/icon.png" alt="Zortex" width="96" />

## Özellikler

- **Snippet'ler**: Sık kullandığınız komutları kaydedin, **tek tıkla** hedef terminalde çalıştırın.
- **Parametreler**: Komuta `{{ad}}` yazın; çalıştırırken bir pencere açılıp değerleri sorar.
  - Varsayılan değer: `{{port:22}}`
  - Aynı parametre birden çok yerde geçerse bir kez sorulur.
  - En son girilen değerler bir sonraki çalıştırmada hazır gelir.
  - Pencerede komutun son halinin canlı önizlemesi görünür.
- **Parametre ekle düğmesi**: Düzenleyicide `{{}}` ekler ve imleci tam ortaya koyar. Metin seçiliyse seçili metni sarmalar. Kısayol: `Ctrl/⌘+Shift+P`.
- **Kategoriler**: Açılıp kapanabilen ağaç görünümü, kategori başına snippet sayısı, yeniden adlandırma ve silme.
- **Arama**:
  - Ad, komut, açıklama ve kategori adında arar.
  - Büyük/küçük harf ve Türkçe karakter farkını yok sayar (`baglanti` yazınca `bağlantı` bulunur).
  - Eşleşen kelimeleri vurgular.
  - `Enter` ilk sonucu çalıştırır, `↓` ile listede gezilir.
- **Bölünmüş terminal**: Tek, ikiye (yan yana / alt alta) ve dörde bölme.
  - Ayırıcılar sürüklenerek boyutlandırılır, çift tıklayınca eşitlenir.
  - Yerleşim küçültülünce gizlenen terminaller kapanmaz, oturumları korunur.
- **Hedef (focus) terminal**:
  - Snippet'ler hedef terminalde çalışır.
  - Hedef bölme mavi çerçeve ve **Hedef** rozetiyle işaretlenir.
  - Kenar çubuğunun altında da “Hedef: Terminal N” yazar.
  - Hedefi değiştirmek için bölmeye tıklayın, ⌖ düğmesini kullanın veya `Ctrl+Shift+1…4` / `⌘1…4` kısayolunu kullanın.
- **Portable**: Kurulum gerekmez.
  - Windows'ta tek bir `.exe` dosyası; veriler exe'nin yanındaki `Zortex Data` klasöründe tutulur, uygulamayı USB bellekle taşıyabilirsiniz.
  - macOS'ta `.app` dosyasını herhangi bir yere koyup çalıştırabilirsiniz.
- **İçe/dışa aktarma**: Snippet'leri JSON dosyası olarak paylaşabilirsiniz. İçe aktarırken mevcutlarla birleştirilir, aynı olanlar tekrar eklenmez.
- **Kabuk seçimi**:
  - Windows: PowerShell 7, Windows PowerShell, cmd, Git Bash, WSL
  - macOS: zsh, bash, fish… (`/etc/shells` içindekiler)

## Kullanım

| İşlem | Windows | macOS |
|---|---|---|
| Snippet ara | `Ctrl+Shift+F` | `⌘F` |
| Yeni snippet | `Ctrl+Shift+N` | `⌘N` |
| Kenar çubuğu aç/kapat | `Ctrl+Shift+B` | `⌘B` |
| Hedef terminal | `Ctrl+Shift+1…4` | `⌘1…4` |
| Kopyala | Seçim varken `Ctrl+C` veya `Ctrl+Shift+C` | `⌘C` |
| Yapıştır | `Ctrl+V` / `Ctrl+Shift+V` | `⌘V` |
| Kopyala / yapıştır | Sağ tık (seçim varsa kopyalar, yoksa yapıştırır) | Sağ tık |
| Ekranı temizle | Bölme başlığındaki silgi | `⌘K` |
| Bağlantı aç | `Ctrl` + tıklama | `⌘` + tıklama |

Windows'ta uygulama kısayolları `Ctrl+Shift` ile başlar, çünkü tek başına `Ctrl+F`, `Ctrl+B` gibi tuşlar kabuğa aittir.

### Snippet söz dizimi

```text
ssh {{kullanıcı}}@{{sunucu}} -p {{port:22}}
docker exec -it {{konteyner}} {{komut:sh}}
git commit -am "{{mesaj}}"
```

Değerler komuta olduğu gibi yazılır. Boşluk içerebilecek değerleri şablonda tırnak içine alın (`"{{yol}}"`). Tırnak kuralları PowerShell, cmd ve zsh'de farklı olduğu için Zortex kaçış karakteri eklemez.

Snippet'i oluştururken **Hemen çalıştır** kutusunu kapatırsanız komut terminale yazılır ama Enter'a basılmaz. Böylece çalıştırmadan önce gözden geçirebilirsiniz.

## İndirme ve çalıştırma

### Windows

`Zortex-<sürüm>-portable.exe` dosyasını istediğiniz klasöre koyup çift tıklayın.

Uygulama imzasız olduğu için ilk açılışta SmartScreen uyarısı çıkabilir. **Ek bilgi → Yine de çalıştır** diyerek açabilirsiniz. Windows 10 ve 11 desteklenir.

### macOS

`Zortex-<sürüm>-mac-arm64.zip` (Apple Silicon) veya `-mac-x64.zip` (Intel) dosyasını açın. `Zortex.app` dosyasını istediğiniz yere taşıyın.

Uygulama Apple Developer sertifikasıyla imzalanmadığı için Gatekeeper ilk açılışta engeller. İki çözüm var:

- `Zortex.app` üzerinde sağ tık → **Aç** → **Aç**, ya da
- Terminalde: `xattr -dr com.apple.quarantine /Applications/Zortex.app`

macOS'ta veriler varsayılan olarak `~/Library/Application Support/Zortex` klasöründe tutulur. Taşınabilir kullanım için `Zortex.app` ile aynı klasörde `Zortex Data` adında bir klasör oluşturun, Zortex verilerini oraya yazar.

## Geliştirme

Gereksinim: Node.js 20+ (24 önerilir). Derleyici gerekmez; `node-pty` her iki platform için hazır derlenmiş gelir.

```bash
npm install
npm run dev          # geliştirme modu (anında yenileme)
npm run typecheck    # TypeScript kontrolü
npm test             # birim testleri (vitest)
npm run test:e2e     # derleyip gerçek uygulamayı Playwright ile uçtan uca test eder
npm run dist:win     # dist/Zortex-<sürüm>-portable.exe
npm run dist:mac     # dist/Zortex-<sürüm>-mac-{arm64,x64}.{zip,dmg}  (yalnızca macOS'ta)
```

macOS paketi yalnızca macOS üzerinde üretilebilir. `.github/workflows/build.yml` iş akışı:

- Her push'ta iki platformda testleri çalıştırır, Windows ve macOS paketlerini üretir ve indirilebilir *artifact* olarak yükler.
- `v*` etiketi atıldığında (`git tag v0.1.0 && git push --tags`) paketleri GitHub Release'e ekler.

### Yapı

```text
src/
  main/       Electron ana süreci: pencere, PTY oturumları (node-pty), kabuk algılama, veri saklama, IPC
  preload/    Renderer'a açılan güvenli ve dar API (contextIsolation + sandbox)
  shared/     Platformdan bağımsız mantık: parametre ayrıştırma, arama, veri doğrulama
  renderer/   React arayüzü: kenar çubuğu, terminal ızgarası (xterm.js), pencereler
tests/
  unit/       Parametre, arama ve veri mantığı testleri
  e2e/        Gerçek uygulama üzerinde uçtan uca testler
```

### Teknik kararlar

- **Electron + xterm.js + node-pty**:
  - xterm.js, VS Code'un da kullandığı terminal çizicisi.
  - node-pty, Windows ConPTY ile macOS PTY arasındaki farkı gizliyor.
  - Tauri daha küçük paket üretirdi ama Rust ve MSVC derleme araçları gerektirir. Bu yapı ek araç gerektirmiyor ve her iki platformda aynı şekilde çalışıyor.
- **Güvenlik**:
  - Renderer'da `contextIsolation`, `sandbox` açık, Node erişimi kapalı.
  - IPC çağrıları gönderen ve tür açısından doğrulanır.
  - Harici bağlantılar yalnızca http/https/mailto olarak açılır, sayfa içinde başka adrese gidilemez.
- **Veri güvenliği**:
  - Kayıtlar önce geçici dosyaya yazılıp sonra yerine taşınır.
  - Bozuk bir veri dosyası silinmez, `data.corrupt-*.json` olarak yedeklenir.
