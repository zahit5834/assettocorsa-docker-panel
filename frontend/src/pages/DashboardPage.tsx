import {
  Activity,
  Boxes,
  Car,
  CheckCircle2,
  Cpu,
  ExternalLink,
  HardDrive,
  Play,
  Plus,
  Server,
  Square,
  Users,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ServerFormModal from '../components/ServerFormModal';
import { apiFetch, type ServerItem, type SystemOverview } from '../lib/api';

export default function DashboardPage() {
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [ov, srv] = await Promise.all([
        apiFetch<SystemOverview>('/api/system/overview'),
        apiFetch<{ servers: ServerItem[] }>('/api/servers'),
      ]);
      setOverview(ov);
      setServers(srv.servers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  const triggerAction = async (id: string, action: 'start' | 'stop') => {
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

  if (loading && !overview) {
    return <div className="text-slate-400 text-sm py-10">Yükleniyor...</div>;
  }

  const memPct = overview
    ? Math.min(100, Math.round((overview.host.usedMemMb / Math.max(1, overview.host.totalMemMb)) * 100))
    : 0;
  const diskPct = overview && overview.host.diskTotalGb > 0
    ? Math.min(100, Math.round((overview.host.diskUsedGb / overview.host.diskTotalGb) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Genel Bakış</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            VDS kaynak durumu, çalışan Assetto Corsa sunucuları ve hızlı işlemler.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Yeni Sunucu Oluştur
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="panel-card p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Aktif Sunucular</span>
            <Server className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {overview?.counts.runningServers ?? 0}
            <span className="text-sm font-normal text-slate-400">
              {' '}
              / {overview?.counts.servers ?? 0}
            </span>
          </div>
        </div>

        <div className="panel-card p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Çevrimiçi Oyuncu</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {overview?.counts.totalPlayers ?? 0}
          </div>
        </div>

        <div className="panel-card p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Harita &amp; Arabalar</span>
            <Car className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {overview?.counts.tracks ?? 0}{' '}
            <span className="text-xs font-normal text-slate-400">harita</span> •{' '}
            {overview?.counts.cars ?? 0}{' '}
            <span className="text-xs font-normal text-slate-400">araba</span>
          </div>
        </div>

        <div className="panel-card p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Kurulu Pack&apos;ler</span>
            <Boxes className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{overview?.counts.packs ?? 0}</div>
        </div>
      </div>

      {/* VDS Telemetry & Engine Status */}
      {overview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="panel-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-400" /> VDS Sistem Kaynakları
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                {overview.host.cpus} vCPU • Load {overview.host.loadAvg[0]}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5" /> RAM Kullanımı
                  </span>
                  <span className="text-slate-200 font-mono">
                    {overview.host.usedMemMb} MB / {overview.host.totalMemMb} MB ({memPct}%)
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-amber-500"
                    style={{ width: `${memPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400 flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5" /> Disk Kullanımı
                  </span>
                  <span className="text-slate-200 font-mono">
                    {overview.host.diskUsedGb} GB / {overview.host.diskTotalGb} GB ({diskPct}%)
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-emerald-500"
                    style={{ width: `${diskPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="panel-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white">Docker &amp; Sunucu Motor Durumu</h2>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#090d14] border border-slate-800">
                <span className="text-slate-300">Docker Engine (/var/run/docker.sock)</span>
                {overview.engines.dockerAvailable ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Bağlı
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-400 font-medium">
                    <XCircle className="w-4 h-4" /> Erişilemiyor
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#090d14] border border-slate-800">
                <span className="text-slate-300">AssettoServer İmajı</span>
                {overview.engines.assettoserver.imageReady ? (
                  <span className="text-emerald-400 font-medium">Hazır</span>
                ) : (
                  <span className="text-amber-400">İlk başlatmada otomatik çekilir</span>
                )}
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#090d14] border border-slate-800">
                <span className="text-slate-300">Vanilla Kunos acServer</span>
                {overview.engines.vanilla.binaryReady && overview.engines.vanilla.imageReady ? (
                  <span className="text-emerald-400 font-medium">Hazır</span>
                ) : (
                  <Link to="/settings" className="text-amber-400 hover:underline">
                    Ayarlar&apos;dan acServer dosyasını yükle →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Server List */}
      <div className="panel-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Sunucularınız</h2>
          <Link to="/servers" className="text-xs text-red-400 hover:text-red-300">
            Tümünü Yönet →
          </Link>
        </div>

        {servers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            Henüz bir Assetto Corsa sunucusu oluşturmadınız. Yukarıdaki &quot;Yeni Sunucu Oluştur&quot;
            butonuyla ilk sunucunuzu kurabilirsiniz.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {servers.map((srv) => (
              <div
                key={srv.id}
                className="px-5 py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-800/20 transition"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        srv.runtime.running ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <Link
                      to={`/servers/${srv.id}`}
                      className="font-semibold text-white hover:text-red-400 transition truncate"
                    >
                      {srv.name}
                    </Link>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        srv.engine === 'assettoserver'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                      }`}
                    >
                      {srv.engine === 'assettoserver' ? 'AssettoServer' : 'Vanilla acServer'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-3 font-mono">
                    <span>UDP:{srv.udp_port}</span>
                    <span>TCP:{srv.tcp_port}</span>
                    <span>HTTP:{srv.http_port}</span>
                    <span>
                      Oyuncu: {srv.live.clients ?? 0}/{srv.max_clients}
                    </span>
                    {srv.effective_track && (
                      <span className="font-sans text-slate-300">
                        Harita: {srv.effective_track.name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/join/${srv.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost text-xs border border-slate-800"
                    title="Oyuncu Davet ve Mod İndirme Sayfası"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Davet Sayfası
                  </a>
                  {srv.runtime.running ? (
                    <button
                      disabled={busyId === srv.id}
                      onClick={() => triggerAction(srv.id, 'stop')}
                      className="btn-secondary text-xs py-2 px-3 text-amber-300"
                    >
                      <Square className="w-3.5 h-3.5" /> Durdur
                    </button>
                  ) : (
                    <button
                      disabled={busyId === srv.id}
                      onClick={() => triggerAction(srv.id, 'start')}
                      className="btn-primary text-xs py-2 px-3 bg-emerald-600 hover:bg-emerald-500"
                    >
                      <Play className="w-3.5 h-3.5" /> Başlat
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <ServerFormModal onClose={() => setShowCreate(false)} onSaved={load} />
      )}
    </div>
  );
}
