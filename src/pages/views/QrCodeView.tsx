/**
 * src/pages/views/QrCodeView.tsx — the view „QR-Code Feedback“ (dashboard.views).
 *
 * ROUTE   #/ansicht/qr-code?record=<interaktion id> — outside the dashboard chrome.
 * LIVE    refreshes every 10 s through useLiveRecords.
 * READS   interaktionen (active only) — the filter below is vSQL, keep it exactly.
 * SHOWS   the pinned interaktion while it is the active one: question above, QR of the public feedback page.
 * PURPOSE Zeigt den QR-Code zum Feedback-Formular der aktiven Interaktion bildschirmfüllend im Saal.
 */
import { useLiveRecords } from '@/hooks/useLiveRecords';
import { tx } from '@/i18n';
import { countOf } from '@/config/plan';
import { extractRecordId } from '@/services/livingAppsService';
import { PublicPageQr } from '@/components/widgets/PublicPageQr';

export default function QrCodeView() {
  const pinned = (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record') ?? '').replace(/["\\]/g, '');
  const interaktionen = useLiveRecords('interaktionen', { intervalMs: 10000, query: { filter: "r.v_ist_aktiv == True and r.v_ist_aktiv == True" } });
  const active = pinned ? interaktionen.records.find(r => r.record_id === pinned) ?? null : null;
  const veranstaltungId = active ? extractRecordId(active.fields.veranstaltung) : null;
  const big = { fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' };
  const mid = { fontSize: 'clamp(1.25rem, 2.2vh, 2.25rem)' };

  return (
    <main className="min-h-dvh bg-background p-6 sm:p-10 text-foreground flex flex-col items-center gap-6 text-center">
      <div className="flex w-full items-center justify-between gap-4 text-muted-foreground" style={mid}>
        <span className="inline-flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${interaktionen.stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          {interaktionen.stale ? tx('Verbindung unterbrochen') : tx('Live')}
        </span>
        <span>{countOf('interaktionen', interaktionen.records.length, tx('Interaktionen'))} {tx('aktiv')}</span>
      </div>

      {!pinned && (
        <p data-view-no-record style={big}>{tx('Bitte über die Übersicht öffnen — diese Ansicht zeigt einen bestimmten Datensatz.')}</p>
      )}

      {pinned && active && (
        <>
          <h1 className="font-semibold max-w-5xl whitespace-pre-line" style={{ fontSize: 'clamp(2rem, 4.5vh, 4.5rem)' }}>{active.fields.frage}</h1>
          {active.fields.erlaeuterung && (
            <p className="text-muted-foreground max-w-4xl whitespace-pre-line" style={big}>{active.fields.erlaeuterung}</p>
          )}
          <PublicPageQr
            entity="veranstaltungen"
            recordId={veranstaltungId}
            page="feedback"
            size="46vh"
            linkClassName="text-muted-foreground"
          />
        </>
      )}

      {pinned && !active && !interaktionen.loading && !interaktionen.error && (
        <p className="font-semibold" style={{ fontSize: 'clamp(2rem, 4.5vh, 4.5rem)' }}>{tx('Gerade keine aktive Frage')}</p>
      )}

      {interaktionen.error && interaktionen.records.length === 0 && (
        <p role="alert" data-live-error className="text-destructive" style={big}>
          {interaktionen.unauthorized ? tx('Bitte melde dich an, um diese Ansicht zu sehen.') : tx('Die Daten konnten nicht geladen werden.')}
        </p>
      )}
    </main>
  );
}
