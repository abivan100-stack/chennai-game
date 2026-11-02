/**
 * Money: cash from fares, and Uncle's loan from Kandasamy the moneylender, repaid a little every
 * day. Pure logic (no DOM / three.js) so scripts/check.ts can test it.
 */
export const LOAN_TOTAL = 15000;
export const DAILY_DUE = 500;

export class Economy {
  cash = 0;
  loan = LOAN_TOTAL;
  rides = 0;
  earnedToday = 0;
  paidToday = 0;
  /** Days in a row the daily amount wasn't paid. */
  missedDays = 0;
  private day: number | null = null;

  earn(amount: number) {
    this.cash += amount;
    this.earnedToday += amount;
    this.rides++;
  }

  /** Pay towards the loan; limited by cash and what's owed. Returns the amount actually paid. */
  pay(amount: number) {
    const paid = Math.max(0, Math.min(amount, this.cash, this.loan));
    this.cash -= paid;
    this.loan -= paid;
    this.paidToday += paid;
    return paid;
  }

  /** Still owed for today. */
  get dueToday() {
    return this.loan > 0 ? Math.max(0, Math.min(DAILY_DUE, this.loan) - this.paidToday) : 0;
  }

  get paidOff() {
    return this.loan <= 0;
  }

  /**
   * Call with the current (IST) day number. On a new day, settles yesterday: returns
   * 'missed' if the daily amount wasn't paid, 'ok' if it was, null if the day hasn't changed.
   */
  tickDay(day: number): 'missed' | 'ok' | null {
    if (this.day === null) this.day = day;
    if (day === this.day) return null;
    const missed = this.dueToday > 0;
    this.missedDays = missed ? this.missedDays + 1 : 0;
    this.day = day;
    this.earnedToday = 0;
    this.paidToday = 0;
    return missed ? 'missed' : 'ok';
  }
}
