/**
 * Checks the rule that decides whether money arrived. Usage: node scripts/billing-test.ts
 * No network, no database — just the matching logic that grants a paid subscription.
 */
import { groupByAddress, isCompedEmail, matchTransfer, type Transfer } from '../server/services/billing.ts';

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


// Comped accounts get the paid product without paying, so the match has to be exact.
const COMPED = ['ceraunophile98@gmail.com', 'deadbody540105@gmail.com', 'syedmukamilshah578@gmail.com'];

check('a listed address is Pro', isCompedEmail('ceraunophile98@gmail.com', COMPED));
check('any address on the list counts, not just the first', isCompedEmail('syedmukamilshah578@gmail.com', COMPED));
check('case is ignored', isCompedEmail('Ceraunophile98@Gmail.com', COMPED));
check('surrounding whitespace is ignored', isCompedEmail('  deadbody540105@gmail.com ', COMPED));
check('an unlisted address is not Pro', !isCompedEmail('someone@else.com', COMPED));
check('a lookalike domain does not match', !isCompedEmail('ceraunophile98@gmail.com.evil.com', COMPED));
check('a substring of a listed address does not match', !isCompedEmail('ceraunophile98', COMPED));
check('an empty list comps nobody', !isCompedEmail('ceraunophile98@gmail.com', []));
check('a missing address is not Pro', !isCompedEmail(undefined, COMPED));


// Rotating the receiving wallet must not strand a payment already in flight.
const OLD = 'TOldWalletBeforeRotation1111111111';
const NEW = 'TNewWalletAfterRotation22222222222';
const grouped = groupByAddress([{ address: OLD }, { address: NEW }, { address: OLD }], NEW);

check('payments are grouped by the address they were quoted', grouped.size === 2);
check('the old wallet is still watched', grouped.get(OLD)?.length === 2);
check('the new wallet is watched too', grouped.get(NEW)?.length === 1);
check('a payment with no stored address falls back to the configured one', groupByAddress([{ address: '' }], NEW).get(NEW)?.length === 1);
check('with no address at all nothing is watched', groupByAddress([{ address: '' }], '').size === 0);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll billing checks passed');
process.exit(failures ? 1 : 0);
