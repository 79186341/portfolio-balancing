# Portfolio rebalancer

A small Next.js app that works out the trades that bring a CAD/USD ETF portfolio back to
its target allocation, one account at a time. Holdings and targets are stored in SQLite through
Prisma.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3001. The app uses port 3001 so it doesn't clash with anything on
3000. `npm run dev` applies any pending migrations first. The database is `dev.db` in the
project root; on first load it creates an account called "My portfolio" with the starting funds:

| Fund                                             | Ticker | Listed in | Target |
| ------------------------------------------------ | ------ | --------- | -----: |
| iShares Core S&P/TSX Capped Composite ETF        | XIC    | CAD (TSX) |    30% |
| Vanguard US Total Market ETF                     | VUN    | CAD (TSX) |    30% |
| Avantis U.S. Small Cap Value ETF                 | AVUV   | USD (US)  |    10% |
| iShares Core MSCI EAFE IMI Index ETF             | XEF    | CAD (TSX) |    16% |
| Avantis International Small Cap Value ETF        | AVDV   | USD (US)  |     6% |
| iShares Core MSCI Emerging Markets IMI Index ETF | XEC    | CAD (TSX) |     8% |

## Using it

- Each account, like a TFSA or RRSP, has its own tab with its own holdings, cash, targets and
  snapshots. **+ Add account** starts a new one, either with the same funds and targets as the
  account you're on or with none. Rename or delete the account you're on with the pencil on its tab.
- Enter the units you hold of each fund and your cash in CAD and USD. Changes save as you type.
- Edit each fund's target percentage; targets must add up to 100%. For cash, the target is an
  amount to keep uninvested (zero by default).
- Add a fund with its ticker and the currency it trades in (CAD for the TSX, USD for US
  exchanges). The ticker is checked against live prices before it's added. Remove one with ×.
- The trades panel lists what to do in order: sells, then any currency conversion, then buys.
  Switch to **Buy only** to invest spare cash without selling anything. Turn off **Convert
  currency** to keep Canadian and US dollars apart, and turn on **Fractional shares** if your
  broker trades them. Each account keeps its own settings.
- **Save a snapshot** to keep a copy of your units, cash and prices under a label, like "Before
  October rebalance". It's a copy: editing your holdings or removing a fund later doesn't change it.
- The snapshot list shows each one's total value and the change since the one before. Under
  **Compare**, pick a snapshot and a later one (or now) to see how each fund's units, price, value
  and weight changed. Rename or delete snapshots from the list.

## How the plan is worked out

- Everything is valued in CAD at the current USD/CAD rate. Fund targets apply to the total
  value minus the cash you keep.
- With whole shares, the plan starts as close to target as whole shares allow without
  overspending, then buys one more share at a time while that brings the portfolio closer to
  target, with leftover cash counted as off target.
- With **Fractional shares**, it sells down to target and spends what that frees up, to 0.0001
  of a share. Buys round down and sells round up, so the plan never spends cash you don't have.
  Trades worth less than $1 are left out.
- **Buy only** never sells. It spreads spare cash over the funds furthest below target.
- After the trades, the plan converts only as much currency as each side needs to cover its
  buys and the cash you keep. It uses the Bank of Canada rate, so your broker's rate will be a
  little worse.
- Without **Convert currency**, CAD cash only buys funds listed in CAD and US cash only funds
  listed in USD, so each currency is balanced on its own, as if it were the whole portfolio. Its
  funds' targets are scaled to what it holds: they stay in proportion to each other, and all its
  spare cash is invested. If one currency holds more than its share, its funds end up over
  target and the other currency's under, until you convert.

The logic is in `src/lib/rebalance.ts`, with tests in `src/lib/rebalance.test.ts`. Snapshot
comparisons are worked out in `src/lib/compare.ts`, which values each snapshot the same way, at the
prices and exchange rate saved with it.

## Where prices come from

- **Fund prices:** TMX Money's quote API, which covers both TSX and US listings. If it fails,
  the app falls back to Yahoo Finance. Neither is an official API and neither needs a key.
- **USD/CAD:** the Bank of Canada's daily average rate, falling back to Yahoo Finance.

Prices refresh when you open the app if they're more than 15 minutes old, or whenever you
press **Refresh prices**. The last prices are kept in the database, so the app still works if
a source is down.

## Scripts

| Command         | What it does                                           |
| --------------- | ------------------------------------------------------ |
| `npm run dev`   | Apply migrations and start the dev server on port 3001 |
| `npm run build` | Production build                                       |
| `npm start`     | Apply migrations and serve the build on port 3001      |
| `npm test`      | Run the rebalancing and snapshot comparison tests      |
| `npm run lint`  | ESLint                                                 |

## Notes

- There's no login: it's meant to run on your own machine. Add authentication before putting
  it on a network.
- The database location is `DATABASE_URL` in `.env` (default `file:./dev.db`).
- After changing `prisma/schema.prisma`, run `npx prisma migrate dev` to create a migration.
