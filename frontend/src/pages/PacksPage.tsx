import {
  Boxes,
  Download,
  Edit3,
  Plus,
  Rocket,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  apiFetch,
  formatBytes,
  uploadWithProgress,
  type CarItem,
  type PackItem,
  type TrackItem,
} from '../lib/api';

export default function PacksPage() {
  const [packs, setPacks] = useState<PackItem[]>([]);
  const [cars, setCars] = useState<CarItem[]>([]);
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PackItem | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PackItem['category']>('mixed');
  const [version, setVersion] = useState('1.0');
  const [selectedCarIds, setSelectedCarIds] = useState<string[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [extraCfgYml, setExtraCfgYml] = useState('');
  const [cspExtra, setCspExtra] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Quick Pack Archive Upload
  const [packArchive, setPackArchive] = useState<File | null>(null);
  const [archivePackName, setArchivePackName] = useState('');
  const [archiveDesc, setArchiveDesc] = useState('');
  const [archiveIsTraffic, setArchiveIsTraffic] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadMsg, setUploadMsg] = useState('');

  const load = async () => {
    try {
      const [pRes, cRes, tRes] = await Promise.all([
        apiFetch<{ packs: PackItem[] }>('/api/packs'),
        apiFetch<{ cars: CarItem[] }>('/api/content/cars'),
        apiFetch<{ tracks: TrackItem[] }>('/api/content/tracks'),
      ]);
      setPacks(pRes.packs);
      setCars(cRes.cars);
      setTracks(tRes.tracks);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setCategory('mixed');
    setVersion('1.0');
    setSelectedCarIds([]);
    setSelectedTrackIds([]);
    setExtraCfgYml('');
    setCspExtra('');
    setError('');
    setShowModal(true);
  };

  const openEdit = (p: PackItem) => {
    setEditing(p);
    setName(p.name);
    setDescription(p.description);
    setCategory(p.category);
    setVersion(p.version);
    setSelectedCarIds(p.car_ids);
    setSelectedTrackIds(p.track_ids);
    setExtraCfgYml(p.extra_cfg_yml);
    setCspExtra(p.csp_extra_options);
    setError('');
    setShowModal(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        name,
        description,
        category,
        version,
        car_ids: selectedCarIds,
        track_ids: selectedTrackIds,
        extra_cfg_yml: extraCfgYml,
        csp_extra_options: cspExtra,
      };
      if (editing) {
        await apiFetch(`/api/packs/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/packs', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pack kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handlePackArchiveUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!packArchive || !archivePackName.trim()) return;
    setUploading(true);
    setProgress(0);
    setUploadMsg('');
    try {
      const fd = new FormData();
      fd.append('file', packArchive);
      fd.append('type', 'pack');
      fd.append('pack_name', archivePackName.trim());
      fd.append('pack_description', archiveDesc.trim());
      if (archiveIsTraffic) {
        fd.append('pack_category', 'traffic');
        fd.append('is_traffic', 'true');
      }
      const res = await uploadWithProgress<{
        importedCars: string[];
        importedTracks: string[];
      }>('/api/content/upload', fd, setProgress);
      setUploadMsg(
        `Pack kuruldu! ${res.importedTracks.length} harita ve ${res.importedCars.length} araba kütüphaneye + Pack'e eklendi${
          archiveIsTraffic ? ' (AI Trafik Pack olarak işaretlendi)' : ''
        }.`
      );
      setPackArchive(null);
      setArchivePackName('');
      setArchiveDesc('');
      setArchiveIsTraffic(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Pack arşivi yüklenemedi.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (p: PackItem) => {
    if (!confirm(`"${p.name}" pack kaydı silinecek (içindeki araba/haritalar kütüphanede kalır). Emin misiniz?`)) {
      return;
    }
    await apiFetch(`/api/packs/${p.id}`, { method: 'DELETE' });
    await load();
  };

  const toggle = (list: string[], id: string, setFn: (v: string[]) => void) => {
    setFn(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Pack Yöneticisi</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Farklı mod paketlerini (Shutoko, Drift, JDM Trafik vb.) tek seferde kurun veya mevcut
            modlardan kendi Pack&apos;lerinizi oluşturup sunuculara tek tıkla uygulayın.
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Kütüphaneden Pack Oluştur
        </button>
      </div>

      {/* Quick Archive Pack Installer */}
      <div className="panel-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Upload className="w-4 h-4 text-purple-400" />
          Arşivden Tek Seferde Pack Kur (.zip / .7z / .rar / .tar.gz)
        </div>
        {uploadMsg && (
          <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-700 text-emerald-200 text-xs">
            {uploadMsg}
          </div>
        )}
        <form onSubmit={handlePackArchiveUpload} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={archivePackName}
              onChange={(e) => setArchivePackName(e.target.value)}
              className="panel-input"
              placeholder="Pack Adı (Örn: No Hesi Trafik Pack)"
              required
            />
            <input
              type="text"
              value={archiveDesc}
              onChange={(e) => setArchiveDesc(e.target.value)}
              className="panel-input"
              placeholder="Açıklama (Opsiyonel)"
            />
            <div className="flex gap-2">
              <label className="flex-1 panel-input cursor-pointer flex items-center justify-center text-xs text-slate-300 truncate">
                {packArchive ? packArchive.name : 'Pack Arşivi Seç...'}
                <input
                  type="file"
                  accept=".zip,.7z,.rar,.tar,.gz,.tgz"
                  className="hidden"
                  onChange={(e) => setPackArchive(e.target.files?.[0] || null)}
                />
              </label>
              <button
                type="submit"
                disabled={uploading || !packArchive}
                className="btn-primary shrink-0"
              >
                {uploading ? `%${progress}` : 'Kur'}
              </button>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-amber-300 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={archiveIsTraffic}
              onChange={(e) => setArchiveIsTraffic(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            Trafik Pack / NPC Aracı (İçindeki tüm arabaları otomatik AI Trafik aracı olarak işaretle)
          </label>
        </form>
      </div>

      {/* Packs List */}
      {loading ? (
        <div className="text-slate-400 text-sm">Yükleniyor...</div>
      ) : packs.length === 0 ? (
        <div className="panel-card p-10 text-center text-slate-400 text-sm">
          Henüz kurulu Pack bulunmuyor. Yukarıdan hazır bir Pack arşivi yükleyebilir veya
          kütüphanenizdeki araba ve haritaları birleştirerek yeni bir Pack oluşturabilirsiniz.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packs.map((p) => (
            <div key={p.id} className="panel-card p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Boxes className="w-5 h-5 text-purple-400 shrink-0" />
                    <h3 className="font-bold text-white truncate">{p.name}</h3>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
                    v{p.version}
                  </span>
                </div>
                {p.description && (
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2">{p.description}</p>
                )}

                <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    {p.category}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {p.track_ids.length} Harita
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {p.car_ids.length} Araba
                  </span>
                  {p.download_size > 0 && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {formatBytes(p.download_size)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 gap-2">
                <Link
                  to={`/servers?pack=${p.id}`}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  <Rocket className="w-3.5 h-3.5" /> Sunucu Kur
                </Link>
                <div className="flex items-center gap-1">
                  {p.download_path && (
                    <a
                      href={`/api/public/dl/pack/${encodeURIComponent(p.slug)}`}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                      title="Pack .zip İndir"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => openEdit(p)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                    title="Düzenle"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 text-red-400"
                    title="Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Pack Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="panel-card w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="font-bold text-white">
                {editing ? 'Pack Düzenle' : 'Yeni Pack Oluştur'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="overflow-y-auto p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Pack Adı *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="panel-input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Kategori</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as PackItem['category'])}
                    className="panel-input"
                  >
                    <option value="mixed">Karma</option>
                    <option value="cars">Araba Pack</option>
                    <option value="tracks">Harita Pack</option>
                    <option value="traffic">Trafik Pack</option>
                    <option value="drift">Drift Pack</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Açıklama</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="panel-input"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Sürüm</label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="panel-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Haritalar ({selectedTrackIds.length} seçili)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1">
                  {tracks.map((t) => {
                    const active = selectedTrackIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggle(selectedTrackIds, t.id, setSelectedTrackIds)}
                        className={`px-3 py-2 rounded-lg border text-left text-xs ${
                          active
                            ? 'bg-emerald-600/20 border-emerald-500 text-white'
                            : 'bg-[#090d14] border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="font-semibold truncate">{t.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{t.id}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs text-slate-400">
                    Arabalar ({selectedCarIds.length} seçili)
                  </label>
                  {category === 'traffic' && cars.some((c) => c.is_traffic) && (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedCarIds(cars.filter((c) => c.is_traffic).map((c) => c.id))
                      }
                      className="text-[11px] text-amber-400 hover:text-amber-300"
                    >
                      Tüm Trafik Araçlarını Seç
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto p-1">
                  {[...cars]
                    .sort((a, b) =>
                      category === 'traffic'
                        ? Number(b.is_traffic) - Number(a.is_traffic)
                        : Number(a.is_traffic) - Number(b.is_traffic)
                    )
                    .map((c) => {
                      const active = selectedCarIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggle(selectedCarIds, c.id, setSelectedCarIds)}
                          className={`px-3 py-2 rounded-lg border text-left text-xs ${
                            active
                              ? c.is_traffic
                                ? 'bg-amber-600/20 border-amber-500 text-white'
                                : 'bg-sky-600/20 border-sky-500 text-white'
                              : 'bg-[#090d14] border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold truncate">{c.name}</span>
                            {c.is_traffic && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
                                AI
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{c.id}</div>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Opsiyonel extra_cfg.yml (AssettoServer)
                  </label>
                  <textarea
                    value={extraCfgYml}
                    onChange={(e) => setExtraCfgYml(e.target.value)}
                    rows={4}
                    className="panel-input font-mono text-xs"
                    placeholder="# Opsiyonel trafik/CSP YAML ayarları"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Opsiyonel csp_extra_options.ini
                  </label>
                  <textarea
                    value={cspExtra}
                    onChange={(e) => setCspExtra(e.target.value)}
                    rows={4}
                    className="panel-input font-mono text-xs"
                    placeholder="; Opsiyonel CSP extra options"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
                  İptal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Kaydediliyor ve Paketleniyor...' : 'Pack Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
