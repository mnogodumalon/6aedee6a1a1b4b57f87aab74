/**
 * Interaktion aktiv setzen — 3-Schritt-Wizard mit QR-Code-Abschluss.
 * Steps: 1) Veranstaltung wählen → 2) Interaktion der Veranstaltung wählen → 3) Prüfen & aktiv setzen;
 * danach öffnet die Erfolgsseite den QR-Code bildschirmfüllend in einem eigenen Tab (#/ansicht/qr-code?record=<id>).
 * Reads: interaktionen (Veranstaltung über die Interaktionen abgeleitet). Writes: interaktionen (update, über den Flow-Hook).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useRef, useState } from 'react';
import { IconQrcode } from '@tabler/icons-react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldNumber, fieldRef, fieldText } from '@/lib/journey';
import { useInteraktionAktivSetzenFlow } from '@/lib/journey/flows/InteraktionAktivSetzen';
import { tx } from '@/i18n';

export default function InteraktionAktivSetzenPage() {
  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState<string | null>(null);

  const flow = useInteraktionAktivSetzenFlow({
    steps: { interaktionen: 2 },
    items: {
      interaktionen: r => ({
        id: r.id,
        title: `${fieldNumber(r, 'reihenfolge') ?? '–'}. ${fieldText(r, 'frage')}`,
        status: r.fields.ist_aktiv === true ? { key: 'aktiv', label: tx('Aktiv') } : undefined,
      }),
    },
    where: { interaktionen: r => !eventId || fieldRef(r, 'veranstaltung') === eventId },
  });

  // Veranstaltungen, die der Pick schon gesehen hat — bleibt stabil, auch wenn die Liste auf eine Veranstaltung eingegrenzt wird
  const seen = useRef(new Map<string, { title: string; count: number }>());
  const search = flow.picks.interaktionen;
  const perEvent = new Map<string, number>();
  for (const r of search.records) {
    const ev = fieldRef(r, 'veranstaltung');
    if (!ev) continue;
    perEvent.set(ev, (perEvent.get(ev) ?? 0) + 1);
    const title = search.refLabel(r, 'veranstaltung');
    if (title) seen.current.set(ev, { title, count: 0 });
  }
  perEvent.forEach((count, ev) => {
    const cur = seen.current.get(ev);
    if (cur) seen.current.set(ev, { ...cur, count });
  });
  const eventItems = [...seen.current.entries()]
    .map(([id, v]) => ({
      id,
      title: v.title,
      subtitle: tx`${v.count} Interaktionen`,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const eventTitle = eventId ? seen.current.get(eventId)?.title ?? '' : '';

  const target = flow.targets.interaktionen;
  const openQr = () => {
    if (!target.selectedId) return;
    const url = `${window.location.origin}${window.location.pathname}#/ansicht/qr-code?record=${target.selectedId}`;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <IntentWizardShell
      title={tx('Interaktion aktiv setzen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Eine Interaktion aktiv schalten und den QR-Code für den Saal öffnen.'),
        needs: [tx('Die Veranstaltung'), tx('Die Interaktion, die jetzt dran ist')],
      }}
    >
      <WizardStep label={tx('Veranstaltung')} description={tx('Für welche Veranstaltung willst du eine Interaktion aktivieren?')}>
        <EntitySelectStep
          items={eventItems}
          loading={search.select.loading}
          error={search.select.error}
          selectedId={eventId}
          onSelect={id => { setEventId(id); setStep(2); }}
          searchPlaceholder={tx('Veranstaltung suchen …')}
          emptyText={tx('Es gibt noch keine Interaktionen. Lege zuerst Interaktionen für deine Veranstaltung an.')}
        />
      </WizardStep>

      <WizardStep label={tx('Interaktion')} description={tx('Welche Interaktion soll jetzt aktiv sein?')}>
        {eventId ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{tx`Veranstaltung: ${eventTitle}`}</p>
            <EntitySelectStep
              {...search.select}
              {...flow.pick('interaktionen')}
              searchPlaceholder={tx('Frage suchen …')}
              emptyText={tx('Diese Veranstaltung hat keine Interaktionen.')}
              onSelect={id => { flow.pick('interaktionen').onSelect(id); setStep(3); }}
            />
            <StepNav onBack={() => setStep(1)} hideBack={false} nextDisabled />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
          </StepNav>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')} description={tx('Die gewählte Interaktion wird aktiv, die anderen der Veranstaltung werden inaktiv.')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            confirmLabel={tx('Aktiv setzen')}
            items={[
              { key: 'veranstaltung', label: tx('Veranstaltung'), value: eventTitle || '—', step: 1 },
              { key: 'folge', label: tx('Folge'), value: tx('Alle anderen Interaktionen dieser Veranstaltung werden inaktiv.') },
            ]}
            whatHappensNext={tx('Danach kannst du den QR-Code bildschirmfüllend in einem eigenen Tab öffnen.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          undo={flow.undo}
          title={tx('Interaktion aktiv gesetzt')}
          facts={[
            { label: tx('Frage'), value: target.record ? fieldText(target.record, 'frage') : '—' },
            { label: tx('Aktiv'), value: tx('Ja') },
          ]}
          whatHappensNext={tx('Öffne den QR-Code in einem eigenen Tab und zeige ihn im Saal.')}
          next={[
            { label: tx('QR-Code öffnen'), onClick: openQr, icon: <IconQrcode size={16} className="shrink-0" /> },
            { label: tx('Feedbacks zusammenfassen'), href: '#/intents/feedbacks-zusammenfassen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
