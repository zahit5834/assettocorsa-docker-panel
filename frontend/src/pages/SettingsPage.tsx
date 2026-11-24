import {
  CheckCircle2,
  Cpu,
  DownloadCloud,
  GitBranch,
  KeyRound,
  RefreshCw,
  Save,
  Terminal,
  Upload,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiFetch, formatBytes, uploadWithProgress } from '../lib/api';

interface SettingsResponse {
  settings: Record<string, string>;
  engines: {
    dockerAvailable: boolean;
    assettoserver: { image: string; imageReady: boolean };
    vanilla: { image: string; imageReady: boolean; binaryReady: boolean; binarySize: number };
  };
}

interface UpdateOverview {
  gitAvailable: boolean;
  repoReady: boolean;
  branch: string;
  currentCommit: string;
  currentMessage: string;
  currentDate: string;
  remoteUrl: string;
  remoteCommit: string;
  remoteMessage: string;
  behindCount: number;
  updateAvailable: boolean;
  changelog: Array<{ hash: string; message: string; date: string }>;
  job: {
    state: 'idle' | 'starting' | 'fetching' | 'pulling' | 'building' | 'completed' | 'error';
    step: string;
    error?: string;
    startedAt?: string;
    finishedAt?: string;
    fromCommit?: string;
    toCommit?: string;
  };
  updaterRunning: boolean;
  logs: string;
  fetchError?: string;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [publicIp, setPublicIp] = useState('');
  const [panelPort, setPanelPort] = useState('5829');
  const [assettoImg, setAssettoImg] = useState('');
  const [vanillaImg, setVanillaImg] = useState('');
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [vanillaFile, setVanillaFile] = useState<File | null>(null);
  const [uploadingBin, setUploadingBin] = useState(false);
  const [binProgress, setBinProgress] = useState(0);

  // App Self-Update state
  const [updateInfo, setUpdateInfo] = useState<UpdateOverview | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updatingApp, setUpdatingApp] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [showUpdateLogs, setShowUpdateLogs] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    const res = await apiFetch<SettingsResponse>('/api/system/settings');
    setData(res);
    setPublicIp(res.settings.public_ip || '');
    setPanelPort(res.settings.panel_port || '5829');
    setAssettoImg(res.settings.assettoserver_image || 'compujuckel/assettoserver:latest');
    setVanillaImg(res.settings.vanilla_ac_image || 'ac-panel-vanilla:latest');
  };

  const loadUpdateStatus = async (fetchRemote = false) => {
    if (fetchRemote) setCheckingUpdate(true);
    try {
      const res = await apiFetch<UpdateOverview>(
        `/api/system/update/status${fetchRemote ? '?fetch=1' : ''}`
      );
      setUpdateInfo(res);
      setReconnecting(false);
      const isBusy =
        res.updaterRunning ||
        ['starting', 'fetching', 'pulling', 'building'].includes(res.job.state);
      if (isBusy && !pollTimerRef.current) {
        startUpdatePolling();
      }
      return res;
    } catch {
      if (updatingApp) {
        setReconnecting(true);
      }
      return null;
    } finally {
      if (fetchRemote) setCheckingUpdate(false);
    }
  };

  const stopUpdatePolling = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const startUpdatePolling = () => {
    stopUpdatePolling();
    setUpdatingApp(true);
    setShowUpdateLogs(true);
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const res = await apiFetch<UpdateOverview>('/api/system/update/status');
        setUpdateInfo(res);
        setReconnecting(false);
        if (!res.updaterRunning && res.job.state === 'completed') {
          stopUpdatePolling();
          setUpdatingApp(false);
          setMsg(res.job.step || 'Güncelleme tamamlandı! Sayfa yenileniyor...');
          setTimeout(() => window.location.reload(), 2000);
        } else if (!res.updaterRunning && res.job.state === 'error') {
          stopUpdatePolling();
          setUpdatingApp(false);
          setErr(res.job.error || 'Güncelleme başarısız oldu.');
        }
      } catch {
        // Expected briefly while backend/web containers restart
        setReconnecting(true);
      }
    }, 3000);
  };

  useEffect(() => {
    load().catch(console.error);
    loadUpdateStatus(false).catch(console.error);
    return () => stopUpdatePolling();
  }, []);

  const triggerAppUpdate = async () => {
    if (
      !confirm(
        'Uygulama GitHub üzerinden güncellenecek ve panel birkaç saniye yeniden başlatılacak. Çalışan Assetto Corsa sunucularınız etkilenmez. Devam edilsin mi?'
      )
    ) {
      return;
    }
    setMsg('');
    setErr('');
    setUpdatingApp(true);
    setShowUpdateLogs(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/system/update/run', {
        method: 'POST',
      });
      setMsg(res.message);
      startUpdatePolling();
    } catch (e) {
      setUpdatingApp(false);
      setErr(e instanceof Error ? e.message : 'Güncelleme başlatılamadı.');
    }
  };

  const saveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      await apiFetch('/api/system/settings', {
        method: 'PUT',
        body: JSON.stringify({
          public_ip: publicIp,
          panel_port: panelPort,
          assettoserver_image: assettoImg,
          vanilla_ac_image: vanillaImg,
        }),
      });
      setMsg('Ayarlar kaydedildi ve tüm sunucu davet/indirme adresleri güncellendi.');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const pullAssettoServer = async () => {
    setPulling(true);
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>('/api/system/engines/pull-assettoserver', {
        method: 'POST',
      });
      setMsg(res.message);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'İmaj güncellenemedi.');
    } finally {
      setPulling(false);
    }
  };

  const uploadVanillaBinary = async (e: FormEvent) => {
    e.preventDefault();
    if (!vanillaFile) return;
    setUploadingBin(true);
    setBinProgress(0);
    setMsg('');
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', vanillaFile);
      const res = await uploadWithProgress<{ message: string }>(
        '/api/system/engines/upload-vanilla',
        fd,
        setBinProgress
      );
      setMsg(res.message);
      setVanillaFile(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Yükleme başarısız.');
    } finally {
      setUploadingBin(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMsg(res.message);
      setCurrentPassword('');
      setNewPassword('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Şifre değiştirilemedi.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Ayarlar &amp; Sunucu Motorları</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Panel güncellemelerini, VDS genel IP adresini, sunucu motorlarını ve admin şifresini yönetin.
        </p>
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-700 text-emerald-200 text-sm">
          {msg}
        </div>
      )}
      {err && (
        <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-sm">
          {err}
        </div>
      )}

      {/* App Self-Update (GitHub) */}
      <div className="panel-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-red-400" /> Uygulama Güncelleme (GitHub)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Paneli GitHub üzerinden tek tıkla güncelleyin. Çalışan Assetto Corsa sunucularınız
              güncelleme sırasında kapanmaz.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={checkingUpdate || updatingApp}
              onClick={() => loadUpdateStatus(true)}
              className="btn-secondary text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
              {checkingUpdate ? 'Kontrol Ediliyor...' : 'Güncellemeleri Kontrol Et'}
            </button>
            <button
              type="button"
              disabled={updatingApp || !updateInfo?.repoReady}
              onClick={triggerAppUpdate}
              className="btn-primary text-xs"
            >
              <DownloadCloud className="w-4 h-4" />
              {updatingApp ? 'Güncelleniyor...' : 'Uygulamayı Güncelle'}
            </button>
          </div>
        </div>

        {updateInfo && !updateInfo.repoReady && (
          <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-700/60 text-amber-200 text-xs">
            Bu kurulum <code>git clone</code> ile yapılmamış (<code>.git</code> bulunamadı).
            Otomatik güncelleme için projeyi GitHub&apos;dan <code>git clone</code> ile kurun veya
            VDS üzerinde <code>sudo bash update.sh</code> kullanın.
          </div>
        )}

        {updateInfo?.repoReady && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#090d14] border border-slate-800 space-y-1">
              <div className="text-slate-400">Mevcut Sürüm</div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-white">{updateInfo.currentCommit}</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                  {updateInfo.branch}
                </span>
              </div>
              <div className="text-slate-300 truncate">{updateInfo.currentMessage}</div>
              <div className="text-[11px] text-slate-500">{updateInfo.currentDate}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#090d14] border border-slate-800 space-y-1">
              <div className="text-slate-400">GitHub Durumu</div>
              {updateInfo.updateAvailable ? (
                <>
                  <div className="text-emerald-400 font-semibold">
                    {updateInfo.behindCount} yeni güncelleme mevcut! ({updateInfo.remoteCommit})
                  </div>
                  <div className="text-slate-300 truncate">{updateInfo.remoteMessage}</div>
                </>
              ) : (
                <div className="text-emerald-400 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Uygulama güncel
                </div>
              )}
              {updateInfo.fetchError && (
                <div className="text-amber-400 text-[11px]">{updateInfo.fetchError}</div>
              )}
              <div className="text-[11px] text-slate-500 font-mono">
                SSH Alternatifi: sudo bash update.sh
              </div>
            </div>
          </div>
        )}

        {updateInfo?.changelog && updateInfo.changelog.length > 0 && (
          <div className="p-3.5 rounded-xl bg-[#090d14] border border-slate-800 space-y-1.5">
            <div className="text-xs font-semibold text-slate-300">Gelecek Değişiklikler</div>
            <ul className="space-y-1 text-xs">
              {updateInfo.changelog.map((item) => (
                <li key={item.hash} className="flex items-center gap-2 text-slate-300">
                  <span className="font-mono text-red-400 shrink-0">{item.hash}</span>
                  <span className="truncate">{item.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(updatingApp || reconnecting || (updateInfo && updateInfo.job.state !== 'idle')) && (
          <div className="p-3.5 rounded-xl bg-[#06090f] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200 flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                {reconnecting
                  ? 'Panel yeniden başlatılıyor, yeniden bağlanılıyor...'
                  : updateInfo?.job.step || 'Güncelleme durumu'}
              </span>
              <button
                type="button"
                onClick={() => setShowUpdateLogs((v) => !v)}
                className="text-slate-400 hover:text-white"
              >
                {showUpdateLogs ? 'Logları Gizle' : 'Logları Göster'}
              </button>
            </div>
            {showUpdateLogs && updateInfo?.logs && (
              <pre className="text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap pt-2 border-t border-slate-800/80">
                {updateInfo.logs}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* VDS Network & Docker Images */}
      <form onSubmit={saveSettings} className="panel-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-white">VDS Bağlantı &amp; İmaj Ayarları</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              VDS Genel IP Adresi (Davet Linkleri İçin)
            </label>
            <input
              type="text"
              value={publicIp}
              onChange={(e) => setPublicIp(e.target.value)}
              className="panel-input font-mono"
              placeholder="Örn: 185.123.45.67"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Panel Portu</label>
            <input
              type="text"
              value={panelPort}
              onChange={(e) => setPanelPort(e.target.value)}
              className="panel-input font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">AssettoServer Docker İmajı</label>
            <input
              type="text"
              value={assettoImg}
              onChange={(e) => setAssettoImg(e.target.value)}
              className="panel-input font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Vanilla acServer Docker İmajı</label>
            <input
              type="text"
              value={vanillaImg}
              onChange={(e) => setVanillaImg(e.target.value)}
              className="panel-input font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary">
            <Save className="w-4 h-4" /> {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
          </button>
        </div>
      </form>

      {/* Engine Management */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="panel-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" /> AssettoServer Motoru
              </h2>
              {data.engines.assettoserver.imageReady ? (
                <span className="text-xs text-emerald-400 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> İmaj Kurulu
                </span>
              ) : (
                <span className="text-xs text-amber-400 inline-flex items-center gap-1">
                  <XCircle className="w-4 h-4" /> İmaj Çekilmedi
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              AI trafik, CSP Extra Options ve freeroam sunucuları için resmi{' '}
              <code className="text-slate-200">{data.engines.assettoserver.image}</code> imajını
              kullanır.
            </p>
            <button
              type="button"
              disabled={pulling}
              onClick={pullAssettoServer}
              className="btn-secondary w-full"
            >
              <DownloadCloud className="w-4 h-4" />
              {pulling ? 'Docker İmajı Çekiliyor...' : 'AssettoServer İmajını Çek / Güncelle'}
            </button>
          </div>

          <div className="panel-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" /> Vanilla Kunos acServer
              </h2>
              {data.engines.vanilla.binaryReady ? (
                <span className="text-xs text-emerald-400 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Binary Hazır (
                  {formatBytes(data.engines.vanilla.binarySize)})
                </span>
              ) : (
                <span className="text-xs text-amber-400 inline-flex items-center gap-1">
                  <XCircle className="w-4 h-4" /> acServer Dosyası Yok
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Steam bilgisayarınızdan{' '}
              <code className="text-slate-200">steamapps/common/assettocorsa/server/acServer</code>{' '}
              Linux dosyasını buraya yükleyin (veya VDS&apos;te{' '}
              <code className="text-slate-200">./scripts/fetch-acserver.sh</code> çalıştırın).
            </p>
            <form onSubmit={uploadVanillaBinary} className="flex gap-2">
              <label className="flex-1 panel-input cursor-pointer text-xs text-slate-300 truncate flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 shrink-0" />
                {vanillaFile ? vanillaFile.name : 'acServer dosyasını seçin...'}
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setVanillaFile(e.target.files?.[0] || null)}
                />
              </label>
              <button
                type="submit"
                disabled={!vanillaFile || uploadingBin}
                className="btn-primary shrink-0"
              >
                {uploadingBin ? `%${binProgress}` : 'Yükle'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Password Change */}
      <form onSubmit={changePassword} className="panel-card p-6 space-y-4 max-w-xl">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-red-400" /> Admin Şifresini Değiştir
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Mevcut Şifre</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="panel-input"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Yeni Şifre (en az 6 karakter)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="panel-input"
              minLength={6}
              required
            />
          </div>
        </div>
        <button type="submit" className="btn-secondary">
          Şifreyi Güncelle
        </button>
      </form>
    </div>
  );
}
