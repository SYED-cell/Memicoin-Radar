/**
 * Checks the rule that decides whether money arrived. Usage: node scripts/billing-test.ts
 * No network, no database — just the matching logic that grants a paid subscription.
 */
import { matchTransfer, type Transfer } from '../server/services/billing.ts';

let failures = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
};

const ADDRESS = 'TPayToThisWallet1111111111111111111';
const now = Date.now();
const payment = { amount: '29.07', created_at: now };
const transfer = (over: Partial<Transfer> = {}): Transfer => ({ amount: '29.07', to: ADDRESS, hash: '0xabc', at: now + 60_000, ...over });

check('exact amount to our address settles the payment', matchTransfer(payment, [transfer()], ADDRESS)?.hash === '0xabc');
check('a different amount does not', !matchTransfer(payment, [transfer({ amount: '29.08' })], ADDRESS));
check('a cent short does not', !matchTransfer(payment, [transfer({ amount: '29.06' })], ADDRESS));
check('paying more than asked does not settle it', !matchTransfer(payment, [transfer({ amount: '30.00' })], ADDRESS));
check('a transfer to another address does not', !matchTransfer(payment, [transfer({ to: 'TSomeoneElse9999999999999999999999' })], ADDRESS));
check('address case is ignored (ERC20 checksums)', !!matchTransfer(payment, [transfer({ to: ADDRESS.toLowerCase() })], ADDRESS.toUpperCase()));
check('an older transfer cannot be reused', !matchTransfer(payment, [transfer({ at: now - 60 * 60_000 })], ADDRESS));
check('a transfer broadcast moments before the intent still counts', !!matchTransfer(payment, [transfer({ at: now - 2 * 60_000 })], ADDRESS));
check('the right one is picked out of many', matchTransfer(payment, [transfer({ amount: '29.01', hash: '0x1' }), transfer({ hash: '0x2' })], ADDRESS)?.hash === '0x2');
check('nothing arrived means nothing granted', !matchTransfer(payment, [], ADDRESS));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll billing checks passed');
process.exit(failures ? 1 : 0);
