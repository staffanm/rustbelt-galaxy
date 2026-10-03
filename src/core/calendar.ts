// The galactic calendar. No two planets agree on a day and no two species agree on a year, so the galaxy counts
// work shifts. One turn of the game is one shift. Ten shifts make a rota. Ten rotas fill a ledger.
export const SHIFTS_PER_ROTA = 10;
export const ROTAS_PER_LEDGER = 10;

export interface CalendarDate {
  ledger: number;
  rota: number;
  shift: number;
}

// The date of a turn. Turn 1 is Shift 1 of Rota 1 in Ledger 1.
export function calendarDate(turn: number): CalendarDate {
  const n = Math.max(0, turn - 1);
  return {
    ledger: Math.floor(n / (SHIFTS_PER_ROTA * ROTAS_PER_LEDGER)) + 1,
    rota: (Math.floor(n / SHIFTS_PER_ROTA) % ROTAS_PER_LEDGER) + 1,
    shift: (n % SHIFTS_PER_ROTA) + 1,
  };
}

// "L1·R4·S6", for lists and logs.
export function dateShort(turn: number): string {
  const d = calendarDate(turn);
  return `L${d.ledger}·R${d.rota}·S${d.shift}`;
}

// "Shift 6 of Rota 4, Ledger 1", for sentences.
export function dateLong(turn: number): string {
  const d = calendarDate(turn);
  return `Shift ${d.shift} of Rota ${d.rota}, Ledger ${d.ledger}`;
}
