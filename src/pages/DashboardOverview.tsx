import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { IconPlus, IconQrcode, IconFileText, IconRobot, IconStar, IconMessage2, IconPlayerStop } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { countOf, viewHref } from '@/config/plan';
import type { Interaktionen } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel, dateFnsLocale } from '@/i18n';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { Button } from '@/components/ui/button';
import { ChartWidget, type ChartRow } from '@/components/widgets/ChartWidget';
import type { Abschlussbewertungen } from '@/types/app';

// Layout: variant="split" — the event cockpit (events with their ordered interactions) is the primary
// surface; the aside carries the moderator's next steps (WorkList) and the rating distribution (ChartWidget).
// No widget fits a "hub with ordered steps" list, so the cockpit is hand-built from existing primitives.
export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { veranstaltungen, interaktionen, rueckmeldungen, abschlussbewertungen, setInteraktionen, fetchAll } = data;
  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'interaktionen') return undefined;
      const rec = interaktionen.find(i => i.record_id === top.record.record_id);
      if (!rec || rec.fields.ist_aktiv) return undefined;
      return { label: tx('Aktiv setzen & QR zeigen'), onClick: () => { void activate(rec); } };
    },
  });
  const clock = useClock();
  const todayKey = format(clock, 'yyyy-MM-dd');
  const [filter, setFilter] = useState<'all' | 'noActive'>('all');

  // feedback count per interaktion
  const feedbackCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rueckmeldungen) {
      const id = extractRecordId(r.fields.interaktion);
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [rueckmeldungen]);

  const byEvent = useMemo(() => {
    const m = new Map<string, Interaktionen[]>();
    for (const i of interaktionen) {
      const id = extractRecordId(i.fields.veranstaltung);
      if (!id) continue;
      const list = m.get(id) ?? [];
      list.push(i);
      m.set(id, list);
    }
    for (const list of m.values()) list.sort((a, b) => (a.fields.reihenfolge ?? 0) - (b.fields.reihenfolge ?? 0));
    return m;
  }, [interaktionen]);

  const ratingsByEvent = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const b of abschlussbewertungen) {
      const id = extractRecordId(b.fields.veranstaltung);
      const n = Number(/(\d)/.exec(b.fields.sterne?.key ?? '')?.[1]);
      if (!id || !n) continue;
      m.set(id, [...(m.get(id) ?? []), n]);
    }
    return m;
  }, [abschlussbewertungen]);

  const events = useMemo(() => {
    const key = (d?: string) => (d ?? '').slice(0, 10);
    const upcoming = veranstaltungen.filter(v => key(v.fields.datum) >= todayKey || !v.fields.datum)
      .sort((a, b) => key(a.fields.datum).localeCompare(key(b.fields.datum)));
    const past = veranstaltungen.filter(v => v.fields.datum && key(v.fields.datum) < todayKey)
      .sort((a, b) => key(b.fields.datum).localeCompare(key(a.fields.datum)));
    return [...upcoming, ...past];
  }, [veranstaltungen, todayKey]);

  const hasActive = (vid: string) => (byEvent.get(vid) ?? []).some(i => i.fields.ist_aktiv);
  const noActiveEvents = events.filter(v => (byEvent.get(v.record_id)?.length ?? 0) > 0 && !hasActive(v.record_id));
  const shownEvents = filter === 'noActive' ? noActiveEvents : events;
  const activeList = interaktionen.filter(i => i.fields.ist_aktiv);
  const activeFeedbacks = activeList.reduce((s, i) => s + (feedbackCount.get(i.record_id) ?? 0), 0);

  // ONE write path for „aktiv setzen“: the exclusive flag moves to this record, the siblings lose it.
  const activate = async (rec: Interaktionen): Promise<string | undefined> => {
    const vid = extractRecordId(rec.fields.veranstaltung);
    const siblings = interaktionen.filter(i => i.record_id !== rec.record_id && i.fields.ist_aktiv && extractRecordId(i.fields.veranstaltung) === vid);
    const snapshot = interaktionen;
    // the tab must open inside the click gesture, before any await
    window.open(viewHref('qr-code', rec.record_id), '_blank', 'noopener');
    const ids = new Set(siblings.map(s => s.record_id));
    setInteraktionen(prev => prev.map(i => i.record_id === rec.record_id ? { ...i, fields: { ...i.fields, ist_aktiv: true } }
      : ids.has(i.record_id) ? { ...i, fields: { ...i.fields, ist_aktiv: false } } : i));
    const undo = () => {
      setInteraktionen(snapshot);
      void Promise.all([
        LivingAppsService.updateInteraktionenEntry(rec.record_id, { ist_aktiv: rec.fields.ist_aktiv ?? false }),
        ...siblings.map(s => LivingAppsService.updateInteraktionenEntry(s.record_id, { ist_aktiv: true })),
      ]).catch(() => fetchAll());
    };
    try {
      await Promise.all(siblings.map(s => LivingAppsService.updateInteraktionenEntry(s.record_id, { ist_aktiv: false })));
      await LivingAppsService.updateInteraktionenEntry(rec.record_id, { ist_aktiv: true });
      undoToast(tx`„${rec.fields.frage ?? ''}“ ist jetzt aktiv`, undo);
      return undefined;
    } catch {
      setInteraktionen(snapshot);
      fetchAll();
      return tx('Konnte nicht aktiv gesetzt werden — bitte erneut versuchen.');
    }
  };

  const deactivate = async (rec: Interaktionen) => {
    const snapshot = interaktionen;
    setInteraktionen(prev => prev.map(i => i.record_id === rec.record_id ? { ...i, fields: { ...i.fields, ist_aktiv: false } } : i));
    try {
      await LivingAppsService.updateInteraktionenEntry(rec.record_id, { ist_aktiv: false });
      undoToast(tx('Interaktion beendet'), () => {
        setInteraktionen(snapshot);
        void LivingAppsService.updateInteraktionenEntry(rec.record_id, { ist_aktiv: true }).catch(() => fetchAll());
      });
    } catch {
      setInteraktionen(snapshot);
      fetchAll();
    }
  };

  const openSummary = (id: string) => window.open(viewHref('zusammenfassung', id), '_blank', 'noopener');

  // next steps for the moderator, across all events
  const nextSteps = [
    ...interaktionen.filter(i => (feedbackCount.get(i.record_id) ?? 0) > 0 && !i.fields.zusammenfassung)
      .map(i => ({ rec: i, kind: 'summary' as const })),
    ...interaktionen.filter(i => !!i.fields.zusammenfassung && !i.fields.ki_antwort)
      .map(i => ({ rec: i, kind: 'ki' as const })),
  ];

  const ratingRows = useMemo<ChartRow<Abschlussbewertungen>[]>(
    () => abschlussbewertungen.map(b => ({ id: `abschlussbewertung:${b.record_id}`, data: b })),
    [abschlussbewertungen],
  );

  // context line — names things in every branch
  const todayEvents = veranstaltungen.filter(v => (v.fields.datum ?? '').slice(0, 10) === todayKey);
  let context: string;
  if (veranstaltungen.length === 0) {
    context = tx('Lege deine erste Veranstaltung an, dann bereitest du die Fragen vor.');
  } else if (activeList.length > 0) {
    const first = activeList[0];
    const vName = crud.enriched.interaktionen.find(i => i.record_id === first.record_id)?.veranstaltungName ?? '';
    context = activeFeedbacks === 1
      ? tx`Bei „${vName}“ läuft gerade „${first.fields.frage ?? ''}“ — erst 1 Rückmeldung da.`
      : tx`Bei „${vName}“ läuft gerade „${first.fields.frage ?? ''}“ — ${activeFeedbacks} Rückmeldungen bisher.`;
  } else if (todayEvents.length > 0) {
    context = tx`Heute: ${namen(todayEvents.map(v => v.fields.titel ?? ''))} — noch keine Frage aktiv.`;
  } else {
    context = tx`Als Nächstes: ${events[0]?.fields.titel ?? ''} — keine Frage ist gerade aktiv.`;
  }

  const fmtDate = (d?: string) => {
    if (!d) return tx('Ohne Datum');
    try { return format(parseISO(d), 'EEE, dd.MM.yyyy HH:mm', { locale: dateFnsLocale() }); } catch { return d; }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground">{context}</p>
        </div>
        {crud.veranstaltungen.canWrite && (
          <Button onClick={() => crud.veranstaltungen.openCreate({})} className="w-full sm:w-auto">
            <IconPlus size={16} className="shrink-0" />
            {tx('Neue Veranstaltung')}
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="split"
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Ohne aktive Frage')}
              value={noActiveEvents.length}
              icon={<IconPlayerStop size={16} className="text-muted-foreground" />}
              tone={noActiveEvents.length > 0 ? 'warning' : 'default'}
              onClick={() => setFilter(f => (f === 'noActive' ? 'all' : 'noActive'))}
              active={filter === 'noActive'}
            />
            <StatStripItem
              title={tx('Rückmeldungen zur aktiven Frage')}
              value={activeFeedbacks}
              icon={<IconMessage2 size={16} className="text-muted-foreground" />}
              tone={activeFeedbacks > 0 ? 'primary' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <div className="space-y-4">
            {shownEvents.length === 0 && (
              <div className="rounded-[27px] bg-card p-8 text-center shadow-lg space-y-3">
                <IconQrcode size={48} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {filter === 'noActive' ? tx('Bei jeder Veranstaltung läuft gerade eine Frage.') : tx('Noch keine Veranstaltung — lege die erste an und füge ihre Fragen hinzu.')}
                </p>
                {filter !== 'noActive' && crud.veranstaltungen.canWrite && (
                  <Button onClick={() => crud.veranstaltungen.openCreate({})}>{tx('Erste Veranstaltung anlegen')}</Button>
                )}
              </div>
            )}
            {shownEvents.map(v => {
              const list = byEvent.get(v.record_id) ?? [];
              const ratings = ratingsByEvent.get(v.record_id) ?? [];
              const avg = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : null;
              const nextOrder = list.reduce((m, i) => Math.max(m, i.fields.reihenfolge ?? 0), 0) + 1;
              return (
                <section key={v.record_id} className="rounded-[27px] bg-card p-5 shadow-lg overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button type="button" className="min-w-0 text-left" onClick={() => crud.veranstaltungen.openDetail(v)}>
                      <h2 className="truncate text-lg font-semibold">{v.fields.titel}</h2>
                      <p className="text-sm text-muted-foreground">
                        {fmtDate(v.fields.datum)}
                        {avg !== null && (
                          <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                            <IconStar size={14} className="shrink-0" />{avg.toLocaleString(undefined, { maximumFractionDigits: 1 })} · {countOf('abschlussbewertungen', ratings.length, appLabel('abschlussbewertungen'))}
                          </span>
                        )}
                      </p>
                    </button>
                    {crud.interaktionen.canWrite && (
                      <Button size="sm" variant="outline" onClick={() => crud.interaktionen.openCreate({ veranstaltung: v.record_id, reihenfolge: nextOrder })}>
                        <IconPlus size={14} className="shrink-0" />{tx('Interaktion')}
                      </Button>
                    )}
                  </div>
                  <ul className="mt-3 divide-y divide-border">
                    {list.length === 0 && (
                      <li className="py-3 text-sm text-muted-foreground">{tx('Noch keine Interaktion — füge die erste Frage hinzu.')}</li>
                    )}
                    {list.map(i => {
                      const n = feedbackCount.get(i.record_id) ?? 0;
                      const enrichedRec = i;
                      return (
                        <li key={i.record_id} className="py-3">
                          <div
                            role="button"
                            tabIndex={0}
                            className="flex min-w-0 cursor-pointer items-start gap-3"
                            onClick={() => crud.interaktionen.openDetail(enrichedRec)}
                            onKeyDown={e => { if (e.key === 'Enter') crud.interaktionen.openDetail(enrichedRec); }}
                          >
                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i.fields.reihenfolge ?? '–'}</span>
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-sm font-medium">{i.fields.frage}</p>
                              <p className="text-xs text-muted-foreground">
                                {i.fields.ist_aktiv && <span className="font-semibold text-emerald-600">{tx('Aktiv')} · </span>}
                                {countOf('rueckmeldungen', n, appLabel('rueckmeldungen'))}
                                {i.fields.zusammenfassung ? <> · {tx('zusammengefasst')}</> : null}
                                {i.fields.ki_antwort ? <> · {tx('KI-Antwort da')}</> : null}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 pl-10">
                            {crud.interaktionen.canWrite && (i.fields.ist_aktiv ? (
                              <>
                                <Button size="sm" variant="default" onClick={() => window.open(viewHref('qr-code', i.record_id), '_blank', 'noopener')}>
                                  <IconQrcode size={14} className="shrink-0" />{tx('QR zeigen')}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => void deactivate(i)}>{tx('Beenden')}</Button>
                              </>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => void activate(i)}>
                                <IconQrcode size={14} className="shrink-0" />{tx('Aktiv setzen')}
                              </Button>
                            ))}
                            <Button size="sm" variant="outline" asChild>
                              <a href={`#/ansicht/zusammenfassung?record=${i.record_id}`} target="_blank" rel="noopener">
                                <IconFileText size={14} className="shrink-0" />{tx('Zusammenfassen')}
                              </a>
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        }
        aside={
          <>
            <WorkList
              title={tx('Als Nächstes')}
              items={nextSteps.map(s => ({
                id: `${s.kind}:${s.rec.record_id}`,
                title: s.rec.fields.frage ?? '',
                secondLine: s.kind === 'summary'
                  ? <><span className="font-medium text-amber-600">{tx('Zusammenfassen')}</span><span className="text-muted-foreground"> · {countOf('rueckmeldungen', feedbackCount.get(s.rec.record_id) ?? 0, appLabel('rueckmeldungen'))}</span></>
                  : <><span className="font-medium text-primary">{tx('KI-Antwort eintragen')}</span></>,
                icon: s.kind === 'summary' ? <IconFileText size={16} className="text-muted-foreground" /> : <IconRobot size={16} className="text-muted-foreground" />,
                action: { label: s.kind === 'summary' ? tx('Öffnen') : tx('Eintragen'), onClick: () => openSummary(s.rec.record_id) },
              }))}
              onItemClick={id => {
                const rec = interaktionen.find(i => i.record_id === id.split(':')[1]);
                if (rec) crud.interaktionen.openDetail(rec);
              }}
              empty={{ text: tx('Alles erledigt — neue Rückmeldungen erscheinen hier, sobald sie eintreffen.') }}
            />
            <ChartWidget<Abschlussbewertungen>
              title={tx('Abschlussbewertungen')}
              rows={ratingRows}
              dimension={{ kind: 'category', accessor: r => r.data.fields.sterne, label: tx('Sterne') }}
              interaction={{
                mode: 'drill',
                onSegmentClick: seg => {
                  const rec = abschlussbewertungen.find(b => `abschlussbewertung:${b.record_id}` === seg.rowIds[0]);
                  if (rec) crud.abschlussbewertungen.openDetail(rec);
                },
              }}
            />
          </>
        }
      />
      {crud.surfaces}
    </div>
  );
}
