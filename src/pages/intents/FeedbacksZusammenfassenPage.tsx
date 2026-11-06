/**
 * Feedbacks zusammenfassen — 5-Schritt-Wizard.
 * Steps: 1) Interaktion wählen → 2) Rückmeldungen zusammenführen → 3) Text bearbeiten & kopieren
 *        → 4) Antwort der KI einfügen → 5) Prüfen & speichern.
 * Reads: interaktionen, rueckmeldungen. Writes: interaktionen (zusammenfassung, ki_antwort — update).
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconCopy, IconCheck, IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, refFilter, useLiveList } from '@/lib/journey';
import { useFeedbacksZusammenfassenFlow } from '@/lib/journey/flows/FeedbacksZusammenfassen';
import { tx } from '@/i18n';

export default function FeedbacksZusammenfassenPage() {
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const flow = useFeedbacksZusammenfassenFlow({
    steps: { interaktionen: 1, zusammenfassung: 3, ki_antwort: 4 },
    items: {
      interaktionen: r => ({ id: r.id, title: fieldText(r, 'frage') }),
    },
  });

  const form = flow.forms.interaktionen;
  const pickedId = (flow.pick('interaktionen').selectedId ?? null) as string | null;
  const target = flow.targets.interaktionen.record;

  const feedbacks = useLiveList(flow.port, 'rueckmeldungen', {
    intervalMs: 0,
    enabled: Boolean(pickedId),
    list: pickedId ? { filter: refFilter('interaktion', pickedId) } : undefined,
  });

  const composed = useMemo(() => {
    if (!target) return '';
    const parts: string[] = [];
    const vor = fieldText(target, 'vorprompt').trim();
    if (vor) parts.push(vor);
    feedbacks.records.forEach(r => {
      const text = fieldText(r, 'feedback_text').trim();
      if (text) parts.push(`${fieldText(r, 'kuerzel')}: ${text}`);
    });
    const end = fieldText(target, 'endprompt').trim();
    if (end) parts.push(end);
    return parts.join('\n\n');
  }, [target, feedbacks.records]);

  useEffect(() => {
    if (pickedId && feedbacks.loaded && composed) form.prefill('zusammenfassung', composed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedId, feedbacks.loaded, composed]);

  const text = String(form.get('zusammenfassung') ?? '');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const missingPick = (
    <StepNav onBack={() => setStep(1)} nextDisabled>
      {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
    </StepNav>
  );

  return (
    <IntentWizardShell
      title={tx('Feedbacks zusammenfassen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Alle Rückmeldungen einer Interaktion zu einem Text für die KI vereinen.'),
        needs: [tx('Die Interaktion, deren Feedbacks du auswerten willst')],
      }}
    >
      <WizardStep label={tx('Interaktion')} description={tx('Welche Interaktion willst du zusammenfassen?')}>
        <EntitySelectStep {...flow.picks.interaktionen.select} {...flow.pick('interaktionen')} />
      </WizardStep>

      <WizardStep label={tx('Zusammenführen')} description={tx('Vorprompt, alle Feedbacks mit Kürzel und Endprompt werden zu einem Text.')}>
        {!pickedId ? missingPick : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary p-4 text-sm">
              {feedbacks.loading && !feedbacks.loaded
                ? tx('Rückmeldungen werden geladen …')
                : tx`${feedbacks.records.length} Rückmeldungen gefunden und mit Vor- und Endprompt zusammengeführt.`}
            </div>
            <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl border bg-card p-4 text-sm">
              {composed || tx('Noch kein Text — diese Interaktion hat keine Rückmeldungen und keine Prompts.')}
            </div>
            <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={!composed}
              onClick={() => form.set('zusammenfassung', composed)}>
              <IconRefresh size={16} className="mr-2 shrink-0" />
              {tx('Text neu zusammenführen')}
            </Button>
            <StepNav onBack={() => setStep(1)} nextStepLabel={tx('Bearbeiten')} />
          </div>
        )}
      </WizardStep>

      <WizardStep label={tx('Bearbeiten & kopieren')} description={tx('Passe den Text an und kopiere ihn mit einem Klick in die KI deiner Wahl.')}>
        {!pickedId ? missingPick : (
          <div className="space-y-4">
            <Bound form={form} name="zusammenfassung" rows={14} />
            <Button type="button" className="w-full sm:w-auto" onClick={copy} disabled={!text}>
              {copied ? <IconCheck size={16} className="mr-2 shrink-0" /> : <IconCopy size={16} className="mr-2 shrink-0" />}
              {copied ? tx('Kopiert') : tx('Text kopieren')}
            </Button>
            <StepNav onBack={() => setStep(2)} onNext={() => flow.validateStep(3)} nextStepLabel={tx('Antwort einfügen')} />
          </div>
        )}
      </WizardStep>

      <WizardStep label={tx('Antwort der KI')} description={tx('Füge die Antwort der KI ein — sie wird bei der Interaktion abgelegt.')}>
        {!pickedId ? missingPick : (
          <div className="space-y-4">
            <Bound form={form} name="ki_antwort" rows={14} />
            <StepNav onBack={() => setStep(3)} onNext={() => flow.validateStep(4)} nextStepLabel={tx('Prüfen')} />
          </div>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep forms={flow.formList} submit={flow.submit}
            whatHappensNext={tx('Zusammenfassung und KI-Antwort werden bei der Interaktion gespeichert.')} />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep result={flow.submit.result} forms={flow.formList} submit={flow.submit}
          next={[
            { label: tx('Interaktion aktiv setzen'), href: '#/intents/interaktion-aktiv-setzen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]} />
      )}
    </IntentWizardShell>
  );
}
