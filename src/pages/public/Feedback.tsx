import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import { Bound } from '@/components/blocks/Bound';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import { FieldErrorSummary } from '@/components/blocks/FieldErrorSummary';
import { Button } from '@/components/ui/button';
import { tx } from '@/i18n';
import {
  loadPublicPagesConfig,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  fieldRef,
  fieldText,
  freshRef,
  useJourneySubmit,
  useLiveList,
  useStepForm,
  useVisitorKey,
  type JourneyPort,
} from '@/lib/journey';

const SLUG = 'feedback';

function newKennung(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function Feedback() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  return <FeedbackInner cfg={cfg} page={page} />;
}

function FeedbackInner({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const [params] = useSearchParams();
  const linkedId = params.get('veranstaltung');
  const port: JourneyPort = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const kuerzel = useVisitorKey();

  const events = useLiveList(port, 'veranstaltungen', { intervalMs: 0, enabled: !!linkedId });
  const live = useLiveList(port, 'interaktionen', { intervalMs: 20000, enabled: !!linkedId });

  const event = linkedId ? events.records.find(r => r.id === linkedId) : undefined;
  const active = useMemo(
    () => live.records.find(r => fieldRef(r, 'veranstaltung') === linkedId),
    [live.records, linkedId],
  );
  const activeId = active?.id ?? null;
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;

  const [kennung, setKennung] = useState(newKennung);

  const form = useStepForm('rueckmeldungen', {
    fields: ['feedback_text'],
    required: { feedback_text: true },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    port,
    [
      {
        key: 'rueckmeldung',
        entity: 'rueckmeldungen',
        form,
        primary: true,
        values: () => ({
          interaktion: activeRef.current ?? '',
          kuerzel: kuerzel,
          absende_kennung: kennung,
        }),
      },
    ],
    {
      draftKey: `feedback-${linkedId ?? 'none'}`,
      check: async () => {
        const id = activeRef.current;
        if (!id || !linkedId) return tx('Inzwischen ist eine andere Frage dran.');
        const pointer = await freshRef(port, 'interaktionen', id, 'ist_aktiv');
        const owner = await freshRef(port, 'interaktionen', id, 'veranstaltung');
        return pointer === id && owner === linkedId ? null : tx('Inzwischen ist eine andere Frage dran.');
      },
    },
  );

  if (!linkedId) {
    return (
      <PublicShell title={page.title}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link ist unvollständig. Scanne bitte den QR-Code der Veranstaltung.')}
        </p>
      </PublicShell>
    );
  }
  if (!live.loaded && live.error) {
    return (
      <PublicShell title={page.title}>
        <LoadProblem onRetry={live.reload} />
      </PublicShell>
    );
  }
  if (!live.loaded || !events.loaded) {
    return <PublicShell loading />;
  }
  if (!event) {
    return (
      <PublicShell title={page.title}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link passt zu keiner Veranstaltung. Scanne bitte den QR-Code noch einmal.')}
        </p>
      </PublicShell>
    );
  }

  const title = fieldText(event, 'titel') || page.title;

  if (submit.result) {
    return (
      <PublicShell title={title}>
        <div className="space-y-4 text-center">
          <p className="text-lg font-semibold">{tx('Danke für dein Feedback!')}</p>
          <div>
            <p className="text-sm text-muted-foreground">{tx('Dein Kürzel')}</p>
            <p className="text-3xl font-mono font-bold tracking-widest">{kuerzel}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              onClick={() => {
                submit.reset();
                form.reset();
                setKennung(newKennung());
              }}
            >
              {tx('Weiteres Feedback geben')}
            </Button>
            <Button asChild variant="outline">
              <Link to={`/public/abschlussbewertung?veranstaltung=${linkedId}`}>
                {tx('Veranstaltung bewerten')}
              </Link>
            </Button>
          </div>
        </div>
      </PublicShell>
    );
  }

  if (!active) {
    return (
      <PublicShell title={title}>
        <p className="text-sm text-muted-foreground">{tx('Gerade ist keine Frage geöffnet. Bitte warte einen Moment.')}</p>
      </PublicShell>
    );
  }

  const erlaeuterung = fieldText(active, 'erlaeuterung');

  return (
    <PublicShell title={title}>
      <form
        className="space-y-5"
        onSubmit={e => {
          e.preventDefault();
          if (!form.validate()) return;
          void submit.run();
        }}
      >
        <div className="space-y-1">
          <p className="text-lg font-semibold whitespace-pre-line">{fieldText(active, 'frage')}</p>
          {erlaeuterung && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{erlaeuterung}</p>
          )}
        </div>
        <Bound form={form} name="feedback_text" rows={5} />
        <FieldErrorSummary forms={[form]} />
        {submit.error && !submit.offline && (
          <p role="alert" className="text-sm text-destructive">{submit.error.message}</p>
        )}
        {submit.offline && (
          <p className="text-sm text-muted-foreground">
            {tx('Keine Verbindung — deine Eingaben sind gesichert.')}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submit.submitting}>
          {tx('Absenden')}
        </Button>
      </form>
    </PublicShell>
  );
}
