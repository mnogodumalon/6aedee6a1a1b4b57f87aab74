import type { Abschlussbewertungen, Interaktionen, Rueckmeldungen } from './app';

export type EnrichedInteraktionen = Interaktionen & {
  veranstaltungName: string;
};

export type EnrichedRueckmeldungen = Rueckmeldungen & {
  interaktionName: string;
};

export type EnrichedAbschlussbewertungen = Abschlussbewertungen & {
  veranstaltungName: string;
};
