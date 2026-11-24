import {
  Bot,
  Car,
  Download,
  FolderSync,
  Globe,
  MapPin,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  apiFetch,
  formatBytes,
  uploadWithProgress,
  type CarItem,
  type TrackItem,
} from '../lib/api';

export default function ContentPage() {
  const [cars, setCars] = useState<CarItem[]>([]);
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [activeTab, setActiveTab] = useState<'tracks' | 'cars' | 'traffic'>('tracks');
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [search, setSearch] = useState('');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [hintType, setHintType] = useState<'auto' | 'car' | 'track' | 'pack'>('auto');
  const [version, setVersion] = useState('');
  const [markKunos, setMarkKunos] = useState(false);
  const [markTraffic, setMarkTraffic] = useState(false);
  const [packName, setPackName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [rescanning, setRescanning] = useState(false);

  const load = async () => {
    const [cRes, tRes] = await Promise.all([
      apiFetch<{ cars: CarItem[] }>('/api/content/cars'),
      apiFetch<{ tracks: TrackItem[] }>('/api/content/tracks'),
    ]);
    setCars(cRes.cars);
    setTracks(tRes.tracks);
  };

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setStatusMsg('');
    setUploading(true);
    setProgress(0);

    try {
      if (uploadMode === 'file') {
        if (!file) throw new Error('Lütfen bir .zip, .7z, .tar.gz veya .rar dosyası seçin.');
        const fd = new FormData();
        fd.append('file', file);
        if (hintType !== 'auto') fd.append('type', hintType);
        if (version.trim()) fd.append('version', version.trim());
        fd.append('is_kunos', String(markKunos));
        fd.append('is_traffic', String(markTraffic));
        if (markTraffic && packName.trim()) fd.append('pack_category', 'traffic');
        if (packName.trim()) fd.append('pack_name', packName.trim());

        const res = await uploadWithProgress<{
          importedCars: string[];
          importedTracks: string[];
          createdPackId: string | null;
        }>('/api/content/upload', fd, setProgress);

        setStatusMsg(
          `Başarıyla eklendi: ${res.importedTracks.length} harita, ${res.importedCars.length} araba${
            res.createdPackId ? ' (+ Pack oluşturuldu!)' : ''
          }`
        );
        setFile(null);
        setPackName('');
        setVersion('');
      } else {
        if (!remoteUrl.trim()) throw new Error('Lütfen geçerli bir indirme URL adresi girin.');
        const res = await apiFetch<{
          importedCars: string[];
          importedTracks: string[];
          createdPackId: string | null;
        }>('/api/content/import-url', {
          method: 'POST',
          body: JSON.stringify({
            url: remoteUrl.trim(),
            type: hintType === 'auto' ? undefined : hintType,
            is_kunos: markKunos,
            is_traffic: markTraffic,
            version: version.trim() || undefined,
            pack_name: packName.trim() || undefined,
            pack_category: markTraffic && packName.trim() ? 'traffic' : undefined,
          }),
        });
        setStatusMsg(
          `URL üzerinden içe aktarıldı: ${res.importedTracks.length} harita, ${res.importedCars.length} araba`
        );
        setRemoteUrl('');
        setPackName('');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yükleme başarısız.');
    } finally {
      setUploading(false);
    }
  };

  const handleRescan = async () => {
    setRescanning(true);
    setStatusMsg('');
    setError('');
    try {
      const res = await apiFetch<{ carsCount: number; tracksCount: number }>(
        '/api/content/rescan',
        { method: 'POST' }
      );
      setStatusMsg(
        `Kütüphane tarandı: ${res.tracksCount} harita, ${res.carsCount} araba senkronize edildi.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tarama başarısız.');
    } finally {
      setRescanning(false);
    }
  };

  const toggleKunos = async (kind: 'cars' | 'tracks', id: string, current: boolean) => {
    await apiFetch(`/api/content/${kind}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_kunos: !current }),
    });
    await load();
  };

  const toggleTraffic = async (id: string, current: boolean) => {
    await apiFetch(`/api/content/cars/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_traffic: !current }),
    });
    await load();
  };

  const deleteItem = async (kind: 'cars' | 'tracks', id: string, name: string) => {
    if (!confirm(`"${name}" kalıcı olarak silinecek. Emin misiniz?`)) return;
    await apiFetch(`/api/content/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  };

  const playerCars = cars.filter((c) => !c.is_traffic);
  const trafficCars = cars.filter((c) => c.is_traffic);

  const matchesSearch = (c: CarItem) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.id.toLowerCase().includes(search.toLowerCase()) ||
    c.brand.toLowerCase().includes(search.toLowerCase());

  const filteredTracks = tracks.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase())
  );
  const filteredPlayerCars = playerCars.filter(matchesSearch);
  const filteredTrafficCars = trafficCars.filter(matchesSearch);
  const displayedCars = activeTab === 'traffic' ? filteredTrafficCars : filteredPlayerCars;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Harita &amp; Araba Kütüphanesi</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Yüklenen her mod otomatik taranır; klasör veya ui_car.json içinde traffic / ai / npc
            geçen araçlar otomatik Trafik Aracı olarak işaretlenir.
          </p>
        </div>
        <button disabled={rescanning} onClick={handleRescan} className="btn-secondary">
          <FolderSync className="w-4 h-4" />
          {rescanning ? 'Taranıyor...' : 'Klasörü Yeniden Tara (SFTP)'}
        </button>
      </div>

      {/* Upload / URL Import Card */}
      <div className="panel-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setUploadMode('file')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                uploadMode === 'file'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Upload className="w-3.5 h-3.5" /> Arşiv Yükle (.zip / .7z / .rar / .tar.gz)
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('url')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                uploadMode === 'url'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> URL&apos;den Doğrudan VDS&apos;e Çek
            </button>
          </div>
          <span className="text-xs text-slate-400">
            Tek bir arşivde birden fazla araba/harita olabilir.
          </span>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs">
            {error}
          </div>
        )}
        {statusMsg && (
          <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-700 text-emerald-200 text-xs">
            {statusMsg}
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4">
          {uploadMode === 'file' ? (
            <label className="block border-2 border-dashed border-slate-700 hover:border-red-500/70 rounded-xl p-6 text-center cursor-pointer bg-[#090d14] transition">
              <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <div className="text-sm font-medium text-slate-200">
                {file
                  ? `${file.name} (${formatBytes(file.size)})`
                  : 'Arşiv dosyasını seçin veya buraya bırakın'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Desteklenenler: .zip, .7z, .rar, .tar.gz
              </div>
              <input
                type="file"
                accept=".zip,.7z,.rar,.tar,.gz,.tgz"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          ) : (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Direkt Arşiv İndirme Linki</label>
              <input
                type="url"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                className="panel-input"
                placeholder="https://ornek.com/shutoko-pack.zip"
                required
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">İçerik Tipi</label>
              <select
                value={hintType}
                onChange={(e) => setHintType(e.target.value as typeof hintType)}
                className="panel-input"
              >
                <option value="auto">Otomatik Algıla</option>
                <option value="track">Harita (Track)</option>
                <option value="car">Araba (Car)</option>
                <option value="pack">Çoklu Mod Pack</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Sürüm Etiketi (Boş = Otomatik Hash)
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="panel-input"
                placeholder="Örn: v0.9.3"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Pack Olarak da Kaydet (Opsiyonel Ad)
              </label>
              <input
                type="text"
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
                className="panel-input"
                placeholder="Örn: JDM Trafik Pack"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={markTraffic}
                  onChange={(e) => setMarkTraffic(e.target.checked)}
                  className="w-4 h-4 accent-amber-500"
                />
                Trafik Pack / NPC Aracı Olarak İşaretle (AI Trafik)
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={markKunos}
                  onChange={(e) => setMarkKunos(e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                Orijinal Kunos İçeriği (Oyunla Gelir)
              </label>
            </div>

            <button type="submit" disabled={uploading} className="btn-primary">
              {uploading
                ? uploadMode === 'file'
                  ? `Yükleniyor ve İşleniyor (%${progress})...`
                  : 'VDS İndiriyor ve İşliyor...'
                : 'Yükle ve Kütüphaneye Ekle'}
            </button>
          </div>

          {uploading && uploadMode === 'file' && (
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </form>
      </div>

      {/* Library Browser */}
      <div className="panel-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('tracks')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                activeTab === 'tracks'
                  ? 'bg-red-600/20 text-red-300 border border-red-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" /> Haritalar ({tracks.length})
            </button>
            <button
              onClick={() => setActiveTab('cars')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                activeTab === 'cars'
                  ? 'bg-sky-600/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Car className="w-3.5 h-3.5" /> Oyuncu Arabaları ({playerCars.length})
            </button>
            <button
              onClick={() => setActiveTab('traffic')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                activeTab === 'traffic'
                  ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bot className="w-3.5 h-3.5" /> Trafik Araçları ({trafficCars.length})
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ara..."
              className="bg-[#090d14] border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 w-56"
            />
          </div>
        </div>

        <div className="p-5">
          {activeTab === 'tracks' ? (
            filteredTracks.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-8">Harita bulunamadı.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTracks.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl bg-[#090d14] border border-slate-800 overflow-hidden flex flex-col"
                  >
                    {t.has_preview && (
                      <img
                        src={`/api/public/preview/track/${encodeURIComponent(t.id)}`}
                        alt={t.name}
                        className="w-full h-32 object-cover bg-slate-900"
                      />
                    )}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-white text-sm truncate">{t.name}</div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
                            v{t.version}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                          {t.id}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {t.pitboxes} Pit
                          </span>
                          {t.layouts.length > 0 && (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              {t.layouts.length} Layout
                            </span>
                          )}
                          {t.has_ai_spline && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                              AI Trafik
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {formatBytes(t.download_size)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                        <button
                          onClick={() => toggleKunos('tracks', t.id, t.is_kunos)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] ${
                            t.is_kunos
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                          title="Orijinal Kunos içeriği durumunu değiştir"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {t.is_kunos ? 'Kunos (Oyunla Gelir)' : 'Özel Mod'}
                        </button>
                        <div className="flex gap-1">
                          <a
                            href={`/api/public/dl/track/${encodeURIComponent(t.id)}`}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                            title="CM Uyumlu .zip İndir"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => deleteItem('tracks', t.id, t.name)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-red-950/60 text-red-400"
                            title="Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : displayedCars.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">
              {activeTab === 'traffic'
                ? 'Henüz AI Trafik / NPC aracı bulunmuyor. Yüklerken "Trafik Pack / NPC Aracı" seçebilir veya mevcut bir arabanın kartındaki butondan "AI Trafik" olarak işaretleyebilirsiniz.'
                : 'Oyuncu arabası bulunamadı.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedCars.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl bg-[#090d14] border border-slate-800 overflow-hidden flex flex-col"
                >
                  {c.has_preview && (
                    <img
                      src={`/api/public/preview/car/${encodeURIComponent(c.id)}`}
                      alt={c.name}
                      className="w-full h-32 object-cover bg-slate-900"
                    />
                  )}
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-white text-sm truncate">{c.name}</div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
                          v{c.version}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                        {c.id}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
                        {c.brand && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {c.brand}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {c.skins.length} Skin
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {formatBytes(c.download_size)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => toggleTraffic(c.id, c.is_traffic)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition ${
                            c.is_traffic
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                              : 'bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25'
                          }`}
                          title="Tek tıkla Oyuncu Aracı / AI Trafik arasında değiştir"
                        >
                          {c.is_traffic ? (
                            <>
                              <Bot className="w-3.5 h-3.5" /> AI Trafik
                            </>
                          ) : (
                            <>
                              <Car className="w-3.5 h-3.5" /> Oyuncu
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => toggleKunos('cars', c.id, c.is_kunos)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] ${
                            c.is_kunos
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                          title="Orijinal Kunos içeriği durumunu değiştir"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {c.is_kunos ? 'Kunos' : 'Mod'}
                        </button>
                      </div>

                      <div className="flex gap-1">
                        <a
                          href={`/api/public/dl/car/${encodeURIComponent(c.id)}`}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                          title="CM Uyumlu .zip İndir"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => deleteItem('cars', c.id, c.name)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-red-950/60 text-red-400"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
