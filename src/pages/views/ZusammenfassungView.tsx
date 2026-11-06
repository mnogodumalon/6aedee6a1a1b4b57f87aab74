/**
 * src/pages/views/ZusammenfassungView.tsx — the view „Zusammenfassung“ (dashboard.views).
 *
 * ROUTE   #/ansicht/zusammenfassung?record=<interaktion id> — outside the dashboard chrome.
 * LIVE    static — loads once.
 * READS   interaktionen (frage, erlaeuterung, vorprompt, endprompt, zusammenfassung, ki_antwort); rueckmeldungen (interaktion, kuerzel, feedback_text)
 * EDITS   the merged text is saved on the interaktion (zusammenfassung), the AI answer in ki_antwort.
 * PURPOSE Führt alle Feedbacks einer Interaktion in ein großes, bearbeitbares Textfeld zusammen, das der Moderator mit den Teilnehmenden durchgeht, kopiert und dem die KI-Antwort angefügt wird.
 */
import { useLiveRecords } from '@/hooks/useLiveRecords';
import { tx } from '@/i18n';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { ViewTextEditor } from '@/components/blocks/ViewTextEditor';

export default function ZusammenfassungView() {
  const pinned = (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record') ?? '').replace(/["\\]/g, '');
  const interaktionen = useLiveRecords('interaktionen', { intervalMs: 0 });
  const rueckmeldungen = useLiveRecords('rueckmeldungen', { intervalMs: 0 });
  const interaktion = interaktionen.records.find(r => r.record_id === pinned) ?? null;
  const big = { fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' };
  const failed = [interaktionen, rueckmeldungen].some(x => x.error);
  const loaded = !interaktionen.loading && !rueckmeldungen.loading && !failed;

  const compose = () => {
    if (!interaktion || !loaded) return null;
    const feedbacks = rueckmeldungen.records
      .filter(r => extractRecordId(r.fields.interaktion) === interaktion.record_id)
      .sort((a, b) => (a.createdat ?? '').localeCompare(b.createdat ?? ''));
    const parts = [
      interaktion.fields.vorprompt?.trim() ?? '',
      ...feedbacks.map(r => `${r.fields.kuerzel ?? '?'}: ${(r.fields.feedback_text ?? '').trim()}`),
      interaktion.fields.endprompt?.trim() ?? '',
    ].filter(Boolean);
    return parts.join('\n\n');
  };

  return (
    <main className="min-h-dvh bg-background p-6 sm:p-10 text-foreground space-y-6">
      {!pinned && (
        <p data-view-no-record style={big}>{tx('Bitte über die Übersicht öffnen — diese Ansicht zeigt einen bestimmten Datensatz.')}</p>
      )}
      {pinned && !interaktion && loaded && (
        <p style={big}>{tx('Diese Interaktion wurde nicht gefunden.')}</p>
      )}
      {interaktion && (
        <>
          <header className="space-y-2">
            <h1 className="font-semibold whitespace-pre-line" style={{ fontSize: 'clamp(2rem, 4.5vh, 4.5rem)' }}>{interaktion.fields.frage}</h1>
            {interaktion.fields.erlaeuterung && (
              <p className="text-muted-foreground whitespace-pre-line" style={big}>{interaktion.fields.erlaeuterung}</p>
            )}
          </header>
          <section className="space-y-2">
            <h2 className="font-semibold" style={big}>{tx('Zusammenfassung der Feedbacks')}</h2>
            <ViewTextEditor
              field="feedback_text"
              recordId={interaktion.record_id}
              value={interaktion.fields.zusammenfassung ?? ''}
              save={async text => {
                await LivingAppsService.updateInteraktionenEntry(interaktion.record_id, { zusammenfassung: text });
                interaktionen.apply(interaktion.record_id, { zusammenfassung: text });
              }}
              compose={compose}
              blocked={failed ? tx('Die Daten konnten nicht geladen werden — es wird nichts zusammengeführt oder gespeichert.') : null}
              minHeight="40vh"
            />
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold" style={big}>{tx('Antwort der KI')}</h2>
            <ViewTextEditor
              field="ki_antwort"
              recordId={`${interaktion.record_id}:ki`}
              value={interaktion.fields.ki_antwort ?? ''}
              save={async text => {
                await LivingAppsService.updateInteraktionenEntry(interaktion.record_id, { ki_antwort: text });
                interaktionen.apply(interaktion.record_id, { ki_antwort: text });
              }}
              minHeight="25vh"
            />
          </section>
        </>
      )}
      {interaktionen.error && interaktionen.records.length === 0 && (
        <p role="alert" data-live-error className="text-destructive" style={big}>
          {interaktionen.unauthorized ? tx('Bitte melde dich an, um diese Ansicht zu sehen.') : tx('Die Daten konnten nicht geladen werden.')}
        </p>
      )}
      {rueckmeldungen.error && rueckmeldungen.records.length === 0 && (
        <p role="alert" data-live-error className="text-destructive" style={big}>
          {rueckmeldungen.unauthorized ? tx('Bitte melde dich an, um diese Ansicht zu sehen.') : tx('Die Daten konnten nicht geladen werden.')}
        </p>
      )}
    </main>
  );
}
