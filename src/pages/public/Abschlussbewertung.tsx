import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig, prepareChallenge,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm, useJourneySubmit, useLiveList, useVisitorKey, fieldText,
  type JourneyRecord, type JourneyPort,
} from '@/lib/journey';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { Button } from '@/components/ui/button';
import { tx } from '@/i18n';

const SLUG = 'abschlussbewertung';

export default function Abschlussbewertung() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
    });
  }, []);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  return <Loaded cfg={cfg} page={page} />;
}

function Loaded({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const [params] = useSearchParams();
  const veranstaltungId = params.get('veranstaltung');
  const live = useLiveList(port, 'veranstaltungen', { intervalMs: 0, enabled: !!veranstaltungId });
  const record = live.records.find(r => r.id === veranstaltungId) ?? null;

  let body: ReactNode;
  if (!veranstaltungId) {
    body = <p className="text-sm text-muted-foreground">{tx('Dieser Link ist unvollständig. Scanne bitte den QR-Code der Veranstaltung.')}</p>;
  } else if (!live.loaded && live.error) {
    body = <LoadProblem onRetry={live.reload} />;
  } else if (!live.loaded) {
    return <PublicShell loading />;
  } else if (!record) {
    body = <p className="text-sm text-muted-foreground">{tx('Dieser Link passt zu keiner Veranstaltung. Scanne bitte den QR-Code noch einmal.')}</p>;
  } else {
    body = <RatingFlow cfg={cfg} page={page} port={port} record={record} />;
  }
  return <PublicShell title={page.title} description={record ? fieldText(record, 'titel') : undefined}>{body}</PublicShell>;
}

function RatingFlow({ cfg, page, port, record }: {
  cfg: PublicPagesConfig; page: PublicPageConfig; port: JourneyPort; record: JourneyRecord;
}) {
  const kuerzel = useVisitorKey();
  const [step, setStep] = useState(1);
  const f = useStepForm('abschlussbewertungen', {
    fields: ['sterne', 'kommentar', 'email', 'einwilligung', 'kuerzel'],
    required: { sterne: true },
    steps: { sterne: 1, kommentar: 1, email: 2, einwilligung: 2, kuerzel: 3 },
    autoComplete: true,
  });
  useEffect(() => { f.prefill('kuerzel', kuerzel); }, [kuerzel]); // eslint-disable-line react-hooks/exhaustive-deps
  const draftKey = `abschlussbewertung-${record.id}`;
  const submit = useJourneySubmit(port, [{
    key: 'bewertung',
    entity: 'abschlussbewertungen',
    form: f,
    primary: true,
    values: { veranstaltung: record.id },
  }], { draftKey });

  const steps = [
    { label: tx('Bewertung') },
    { label: tx('E-Mail (freiwillig)') },
    { label: tx('Prüfen') },
  ];

  const skipEmail = () => {
    f.set('email', '');
    f.set('einwilligung', false);
    setStep(3);
  };

  return (
    <IntentWizardShell steps={steps} currentStep={step} onStepChange={setStep} back={false} forms={[f]} draftKey={draftKey}>
      {step === 1 && (
        <div className="space-y-5" onFocusCapture={() => prepareChallenge(cfg, page, 'POST', `/apps/${page.endpoints?.find(e => e.op === 'create')?.app_id}/records`)}>
          <Bound form={f} name="sterne" label={tx('Wie war die Veranstaltung?')} />
          <Bound form={f} name="kommentar" label={tx('Kommentar (optional)')} />
          <StepNav hideBack onNext={() => f.validate(['sterne'])} nextStepLabel={tx('E-Mail')} />
        </div>
      )}
      {step === 2 && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {tx('Möchtest du später eine persönliche Auswertung per E-Mail erhalten? Wir verknüpfen sie mit deinem Kürzel auf diesem Handy.')}
          </p>
          <Bound form={f} name="email" />
          <Field form={f} name="einwilligung" hideLabel>
            <label className="flex items-start gap-3 text-sm">
              <span>{tx('Mit Weiter willigst du ein, dass mir eine persönliche Auswertung an die eingetragene E-Mail geschickt wird. Ohne E-Mail erfolgt keine Einwilligung.')}</span>
            </label>
          </Field>
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => {
              const hasMail = String(f.get('email') ?? '').trim() !== '';
              f.set('einwilligung', hasMail);
              return f.validate(['email']);
            }}
            nextStepLabel={tx('Prüfen')}
          >
            <Button type="button" variant="ghost" size="sm" onClick={skipEmail}>{tx('Nein, danke')}</Button>
          </StepNav>
        </div>
      )}
      {step === 3 && !submit.done && (
        <SummaryStep forms={[f]} submit={submit} whatHappensNext={tx('Mit dem Absenden ist deine Bewertung gespeichert.')} />
      )}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[f]}
          title={tx('Danke für deine Bewertung!')}
          whatHappensNext={tx('Dein Kürzel für diese Veranstaltung: ') + kuerzel}
        >
          <Link className="text-sm font-medium text-primary underline" to={`/public/feedback?veranstaltung=${record.id}`}>
            {tx('Zum Feedback zur aktiven Frage')}
          </Link>
        </SuccessStep>
      )}
    </IntentWizardShell>
  );
}
