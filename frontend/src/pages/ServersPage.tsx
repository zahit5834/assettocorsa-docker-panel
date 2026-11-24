import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Play,
  Plus,
  RotateCw,
  Settings2,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ServerFormModal from '../components/ServerFormModal';
import { apiFetch, copyToClipboard, type ServerItem } from '../lib/api';

export default function ServersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerItem | null>(null);
  const [cloningServer, setCloningServer] = useState<ServerItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Clone state
  const [cloneName, setCloneName] = useState('');
  const [cloneEngine, setCloneEngine] = useState<'assettoserver' | 'vanilla'>('assettoserver');
  const [cloneUdp, setCloneUdp] = useState(9601);
  const [cloneTcp, setCloneTcp] = useState(9601);
  const [cloneHttp, setCloneHttp] = useState(8082);
  const [cloneError, setCloneError] = useState('');

  const preselectedPackId = searchParams.get('pack') || undefined;

  useEffect(() => {
    if (preselectedPackId) {
      setShowCreate(true);
    }
  }, [preselectedPackId]);

  const load = async () => {
    try {
      const res = await apiFetch<{ servers: ServerItem[] }>('/api/servers');
      setServers(res.servers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const runAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    setBusyId(id);
    try {
      await apiFetch(`/api/servers/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'İşlem başarısız.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (srv: ServerItem) => {
    if (!confirm(`"${srv.name}" sunucusu ve Docker container'ı kalıcı olarak silinecek. Emin misiniz?`)) {
      return;
    }
    setBusyId(srv.id);
    try {
      await apiFetch(`/api/servers/${srv.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Silinemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const openClone = async (srv: ServerItem) => {
    setCloningServer(srv);
    setCloneName(`${srv.name} Kopya`);
    setCloneEngine(srv.engine);
    setCloneError('');
    try {
      const p = await apiFetch<{ udp_port: number; tcp_port: number; http_port: number }>(
        '/api/servers/suggest-ports'
      );
      setCloneUdp(p.udp_port);
      setCloneTcp(p.tcp_port);
      setCloneHttp(p.http_port);
    } catch {
      setCloneUdp(srv.udp_port + 1);
      setCloneTcp(srv.tcp_port + 1);
      setCloneHttp(srv.http_port + 1);
    }
  };

  const submitClone = async (e: FormEvent) => {
    e.preventDefault();
    if (!cloningServer) return;
    setCloneError('');
    try {
      await apiFetch(`/api/servers/${cloningServer.id}/clone`, {
        method: 'POST',
        body: JSON.stringify({
          name: cloneName,
          engine: cloneEngine,
          udp_port: Number(cloneUdp),
          tcp_port: Number(cloneTcp),
          http_port: Number(cloneHttp),
        }),
      });
      setCloningServer(null);
      await load();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Klonlama başarısız.');
    }
  };

  const handleCopy = async (key: string, text: string) => {
    await copyToClipboard(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sunucular</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Her sunucu izole Docker container içinde seçtiğiniz motor ve portlarda çalışır.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Yeni Sunucu Oluştur
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-10">Yükleniyor...</div>
      ) : servers.length === 0 ? (
        <div className="panel-card p-12 text-center">
          <h3 className="text-lg font-semibold text-white">Henüz Sunucu Yok</h3>
          <p className="text-sm text-slate-400 mt-1 mb-5">
            AssettoServer veya Vanilla acServer seçip kendi portlarınızla ilk sunucunuzu oluşturun.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> İlk Sunucuyu Oluştur
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {servers.map((srv) => (
            <div key={srv.id} className="panel-card p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          srv.runtime.running
                            ? 'bg-emerald-400 shadow-sm shadow-emerald-400'
                            : 'bg-slate-600'
                        }`}
                      />
                      <Link
                        to={`/servers/${srv.id}`}
                        className="text-lg font-bold text-white hover:text-red-400 transition truncate"
                      >
                        {srv.name}
                      </Link>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          srv.engine === 'assettoserver'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                        }`}
                      >
                        {srv.engine === 'assettoserver' ? 'AssettoServer' : 'Vanilla acServer'}
                      </span>
                      {srv.traffic_enabled && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          AI Trafik
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-mono text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        UDP {srv.udp_port}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        TCP {srv.tcp_port}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        HTTP {srv.http_port}
                      </span>
                    </div>
                  </div>

                  <div className="text-right text-xs text-slate-400 shrink-0">
                    <div className="font-semibold text-slate-200">
                      {srv.live.clients ?? 0} / {srv.max_clients} Oyuncu
                    </div>
                    {srv.runtime.running && (
                      <div className="font-mono text-[11px] mt-0.5">
                        CPU {srv.runtime.cpuPercent ?? 0}% • {srv.runtime.memoryUsageMb ?? 0} MB
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Harita:{' '}
                    <strong className="text-slate-200">
                      {srv.effective_track?.name || 'Seçilmedi'}
                    </strong>
                    {srv.track_config ? ` (${srv.track_config})` : ''}
                  </span>
                  <span>
                    Araba: <strong className="text-slate-200">{srv.effective_car_count}</strong>
                  </span>
                  <span>
                    Pack: <strong className="text-slate-200">{srv.pack_ids.length}</strong>
                  </span>
                </div>

                {/* Direct Join & Mod Portal Links */}
                <div className="mt-3 p-3 rounded-xl bg-[#090d14] border border-slate-800/90 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400 truncate font-mono">
                      {srv.joinLinks.portalUrl}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleCopy(`portal-${srv.id}`, srv.joinLinks.portalUrl)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1"
                        title="Oyuncu Davet & Mod İndirme Linkini Kopyala"
                      >
                        {copiedId === `portal-${srv.id}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        Link
                      </button>
                      <a
                        href={`/join/${srv.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Aç
                      </a>
                      <a
                        href={srv.joinLinks.cmDirectLink}
                        className="px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 inline-flex items-center gap-1"
                        title="Content Manager ile Direkt Bağlan"
                      >
                        <Link2 className="w-3.5 h-3.5" /> Bağlan
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  {srv.runtime.running ? (
                    <>
                      <button
                        disabled={busyId === srv.id}
                        onClick={() => runAction(srv.id, 'stop')}
                        className="btn-secondary text-xs py-1.5 px-3 text-amber-300"
                      >
                        <Square className="w-3.5 h-3.5" /> Durdur
                      </button>
                      <button
                        disabled={busyId === srv.id}
                        onClick={() => runAction(srv.id, 'restart')}
                        className="btn-secondary text-xs py-1.5 px-3"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> Yeniden Başlat
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={busyId === srv.id}
                      onClick={() => runAction(srv.id, 'start')}
                      className="btn-primary text-xs py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500"
                    >
                      <Play className="w-3.5 h-3.5" /> Başlat
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Link
                    to={`/servers/${srv.id}`}
                    className="btn-ghost text-xs py-1.5 px-2.5"
                  >
                    <Settings2 className="w-3.5 h-3.5" /> Konsol &amp; Yönet
                  </Link>
                  <button
                    onClick={() => openClone(srv)}
                    className="btn-ghost text-xs py-1.5 px-2.5"
                    title="Sunucuyu Klonla"
                  >
                    <Copy className="w-3.5 h-3.5" /> Klonla
                  </button>
                  <button
                    disabled={busyId === srv.id}
                    onClick={() => handleDelete(srv)}
                    className="btn-ghost text-xs py-1.5 px-2 text-red-400 hover:text-red-300 hover:bg-red-950/40"
                    title="Sunucuyu Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showCreate || editingServer) && (
        <ServerFormModal
          initialServer={editingServer}
          preselectedPackId={preselectedPackId}
          onClose={() => {
            setShowCreate(false);
            setEditingServer(null);
            if (preselectedPackId) {
              setSearchParams({});
            }
          }}
          onSaved={load}
        />
      )}

      {/* Clone Modal */}
      {cloningServer && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="panel-card w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Sunucuyu Klonla</h3>
              <button
                onClick={() => setCloningServer(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {cloneError && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs">
                {cloneError}
              </div>
            )}
            <form onSubmit={submitClone} className="space-y-3.5">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Yeni Sunucu Adı</label>
                <input
                  type="text"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  className="panel-input"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Sunucu Motoru</label>
                <select
                  value={cloneEngine}
                  onChange={(e) => setCloneEngine(e.target.value as 'assettoserver' | 'vanilla')}
                  className="panel-input"
                >
                  <option value="assettoserver">AssettoServer</option>
                  <option value="vanilla">Vanilla Kunos acServer</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">UDP</label>
                  <input
                    type="number"
                    value={cloneUdp}
                    onChange={(e) => setCloneUdp(Number(e.target.value))}
                    className="panel-input font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">TCP</label>
                  <input
                    type="number"
                    value={cloneTcp}
                    onChange={(e) => setCloneTcp(Number(e.target.value))}
                    className="panel-input font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">HTTP</label>
                  <input
                    type="number"
                    value={cloneHttp}
                    onChange={(e) => setCloneHttp(Number(e.target.value))}
                    className="panel-input font-mono"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCloningServer(null)}
                  className="btn-secondary"
                >
                  İptal
                </button>
                <button type="submit" className="btn-primary">
                  Klonla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
