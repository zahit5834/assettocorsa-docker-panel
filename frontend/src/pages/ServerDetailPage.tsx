import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  FileCode2,
  Link2,
  PackageCheck,
  Play,
  RotateCw,
  Save,
  Settings,
  Shield,
  Square,
  Terminal,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ServerFormModal from '../components/ServerFormModal';
import { apiFetch, copyToClipboard, formatBytes, getToken, type ServerItem } from '../lib/api';

const CONFIG_TABS = [
  'server_cfg.ini',
  'entry_list.ini',
  'extra_cfg.yml',
  'csp_extra_options.ini',
] as const;

export default function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [server, setServer] = useState<ServerItem | null>(null);
  const [tab, setTab] = useState<'console' | 'files' | 'players'>('console');
  const [files, setFiles] = useState<Record<string, string>>({});
  const [activeFile, setActiveFile] = useState<(typeof CONFIG_TABS)[number]>('server_cfg.ini');
  const [logs, setLogs] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [rebuildingBundle, setRebuildingBundle] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    if (!id) return;
    const [srvRes, filesRes] = await Promise.all([
      apiFetch<{ server: ServerItem }>(`/api/servers/${id}`),
      apiFetch<{ files: Record<string, string> }>(`/api/servers/${id}/files`),
    ]);
    setServer(srvRes.server);
    setFiles(filesRes.files);
  };

  useEffect(() => {
    load().catch(console.error);
    const t = setInterval(() => {
      if (id) {
        apiFetch<{ server: ServerItem }>(`/api/servers/${id}`)
          .then((r) => setServer(r.server))
          .catch(() => undefined);
      }
    }, 8000);
    return () => clearInterval(t);
  }, [id]);

  // WebSocket live log stream
  useEffect(() => {
    if (!id || tab !== 'console') return;
    const token = getToken();
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/api/ws/servers/${id}/logs?token=${encodeURIComponent(token)}`;
    setLogs('');

    const ws = new WebSocket(wsUrl);
    ws.onmessage = (ev) => {
      setLogs((prev) => {
        const next = prev + String(ev.data);
        return next.length > 150_000 ? next.slice(-120_000) : next;
      });
    };
    ws.onerror = () => {
      apiFetch<{ logs: string }>(`/api/servers/${id}/logs`)
        .then((r) => setLogs(r.logs))
        .catch(() => undefined);
    };

    return () => {
      ws.close();
    };
  }, [id, tab, server?.runtime.containerId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const runAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!id) return;
    setBusy(true);
    try {
      await apiFetch(`/api/servers/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const saveCurrentFile = async () => {
    if (!id) return;
    setSavingFile(true);
    try {
      await apiFetch(`/api/servers/${id}/files`, {
        method: 'PUT',
        body: JSON.stringify({ filename: activeFile, content: files[activeFile] || '' }),
      });
      alert(`${activeFile} kaydedildi. Değişikliğin aktif olması için sunucuyu yeniden başlatın.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kaydedilemedi.');
    } finally {
      setSavingFile(false);
    }
  };

  const rebuildBundle = async () => {
    if (!id) return;
    setRebuildingBundle(true);
    try {
      const res = await apiFetch<{
        bundleSize: number;
        includedCars: number;
        includedTracks: number;
      }>(`/api/servers/${id}/rebuild-bundle`, { method: 'POST' });
      alert(
        `Toplu mod paketi oluşturuldu: ${res.includedTracks} harita + ${res.includedCars} araba (${formatBytes(res.bundleSize)})`
      );
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Paket oluşturulamadı.');
    } finally {
      setRebuildingBundle(false);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    await copyToClipboard(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!server) {
    return <div className="text-slate-400 text-sm py-10">Sunucu yükleniyor...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            to="/servers"
            className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 mb-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Sunuculara Dön
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`w-3 h-3 rounded-full ${
                server.runtime.running ? 'bg-emerald-400' : 'bg-slate-600'
              }`}
            />
            <h1 className="text-2xl font-bold text-white">{server.name}</h1>
            <span
              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                server.engine === 'assettoserver'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
              }`}
            >
              {server.engine === 'assettoserver' ? 'AssettoServer' : 'Vanilla acServer'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowEdit(true)} className="btn-secondary">
            <Settings className="w-4 h-4" /> Ayarları Düzenle
          </button>
          {server.runtime.running ? (
            <>
              <button
                disabled={busy}
                onClick={() => runAction('restart')}
                className="btn-secondary"
              >
                <RotateCw className="w-4 h-4" /> Yeniden Başlat
              </button>
              <button
                disabled={busy}
                onClick={() => runAction('stop')}
                className="btn-secondary text-amber-300"
              >
                <Square className="w-4 h-4" /> Durdur
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              onClick={() => runAction('start')}
              className="btn-primary bg-emerald-600 hover:bg-emerald-500"
            >
              <Play className="w-4 h-4" /> Başlat
            </button>
          )}
        </div>
      </div>

      {/* Direct Join, Mod Portal & Firewall Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Link2 className="w-4 h-4 text-red-400" /> Oyuncu Davet &amp; Direkt Bağlanma Linkleri
          </h2>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-lg bg-[#090d14] border border-slate-800">
              <div className="text-slate-400 mb-1">
                Oyuncu Davet + Mod İndirme Sayfası (Arkadaşlarınızla Paylaşın)
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-emerald-300 truncate">
                  {server.joinLinks.portalUrl}
                </span>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => handleCopy('portal', server.joinLinks.portalUrl)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1"
                  >
                    {copiedKey === 'portal' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    Kopyala
                  </button>
                  <a
                    href={`/join/${server.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Aç
                  </a>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#090d14] border border-slate-800">
              <div className="text-slate-400 mb-1">Direkt Content Manager Bağlantısı</div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-slate-300 truncate">
                  {server.joinLinks.cmDirectLink}
                </span>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => handleCopy('cm', server.joinLinks.cmDirectLink)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1"
                  >
                    {copiedKey === 'cm' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    Kopyala
                  </button>
                  <a
                    href={server.joinLinks.cmDirectLink}
                    className="px-2 py-1 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300"
                  >
                    Bağlan
                  </a>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-400">
                Toplu Mod Paketi:{' '}
                {server.bundle_size > 0 ? (
                  <strong className="text-emerald-300">
                    Hazır ({formatBytes(server.bundle_size)})
                  </strong>
                ) : (
                  <span>İlk indirmede otomatik üretilir</span>
                )}
              </span>
              <button
                disabled={rebuildingBundle}
                onClick={rebuildBundle}
                className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
              >
                <PackageCheck className="w-3.5 h-3.5" />
                {rebuildingBundle ? 'Hazırlanıyor...' : 'Paketi Şimdi Oluştur'}
              </button>
            </div>
          </div>
        </div>

        <div className="panel-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" /> Portlar &amp; VDS Güvenlik Duvarı (UFW)
          </h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-lg bg-[#090d14] border border-slate-800">
              <div className="text-[11px] text-slate-400">UDP Port</div>
              <div className="font-mono font-bold text-white">{server.udp_port}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#090d14] border border-slate-800">
              <div className="text-[11px] text-slate-400">TCP Port</div>
              <div className="font-mono font-bold text-white">{server.tcp_port}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#090d14] border border-slate-800">
              <div className="text-[11px] text-slate-400">HTTP Port</div>
              <div className="font-mono font-bold text-white">{server.http_port}</div>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-[#090d14] border border-slate-800 flex items-center justify-between gap-2">
            <code className="text-[11px] text-emerald-400 font-mono truncate">
              {server.firewall.oneLiner}
            </code>
            <button
              onClick={() => handleCopy('ufw', server.firewall.oneLiner)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs inline-flex items-center gap-1 shrink-0"
            >
              {copiedKey === 'ufw' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              Kopyala
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Oyuncuların bu sunucuya bağlanabilmesi için VDS üzerinde yukarıdaki portların açık
            olduğundan emin olun.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="panel-card overflow-hidden">
        <div className="flex border-b border-slate-800 bg-[#0c111b]">
          <button
            onClick={() => setTab('console')}
            className={`px-5 py-3 text-sm font-medium inline-flex items-center gap-2 border-b-2 transition ${
              tab === 'console'
                ? 'border-red-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" /> Canlı Konsol
          </button>
          <button
            onClick={() => setTab('files')}
            className={`px-5 py-3 text-sm font-medium inline-flex items-center gap-2 border-b-2 transition ${
              tab === 'files'
                ? 'border-red-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode2 className="w-4 h-4" /> Konfigürasyon Dosyaları
          </button>
          <button
            onClick={() => setTab('players')}
            className={`px-5 py-3 text-sm font-medium inline-flex items-center gap-2 border-b-2 transition ${
              tab === 'players'
                ? 'border-red-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" /> Canlı Oyuncular ({server.live.clients ?? 0})
          </button>
        </div>

        {tab === 'console' && (
          <div className="p-4">
            <div className="bg-[#06090f] border border-slate-800 rounded-xl p-4 h-[420px] overflow-y-auto font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
              {logs || 'Konsol çıktısı bekleniyor...'}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {tab === 'files' && (
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {CONFIG_TABS.map((fname) => (
                  <button
                    key={fname}
                    onClick={() => setActiveFile(fname)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
                      activeFile === fname
                        ? 'bg-red-600/20 text-red-300 border border-red-500/40'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {fname}
                  </button>
                ))}
              </div>
              <button disabled={savingFile} onClick={saveCurrentFile} className="btn-primary py-1.5 text-xs">
                <Save className="w-3.5 h-3.5" /> {savingFile ? 'Kaydediliyor...' : 'Dosyayı Kaydet'}
              </button>
            </div>

            <textarea
              value={files[activeFile] || ''}
              onChange={(e) => setFiles((prev) => ({ ...prev, [activeFile]: e.target.value }))}
              className="w-full h-[420px] bg-[#06090f] border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-100 focus:outline-none focus:border-red-500"
              spellCheck={false}
            />
          </div>
        )}

        {tab === 'players' && (
          <div className="p-5">
            {!server.runtime.running ? (
              <div className="text-sm text-slate-400">Sunucu şu anda çalışmıyor.</div>
            ) : server.live.players.length === 0 ? (
              <div className="text-sm text-slate-400">Şu anda sunucuda bağlı oyuncu yok.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {server.live.players.map((p, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#090d14] border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-sm text-white">{p.name}</div>
                      <div className="text-xs text-slate-400 font-mono">{p.car}</div>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                      Bağlı
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showEdit && (
        <ServerFormModal
          initialServer={server}
          onClose={() => setShowEdit(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
