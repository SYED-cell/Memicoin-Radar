import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, patch, post } from '../lib/api';
import { summarizePortfolio, type PortfolioSummary } from '../services/portfolio';
import type { Token, TradeSide, TradingState, Transaction } from '../types';
import { useAuth } from './AuthContext';
import { useMarket } from './MarketContext';

const EMPTY: TradingState = { startingBalance: 10_000, cash: 10_000, positions: [], transactions: [], equity: [] };

export interface TradeRequest {
  side: TradeSide;
  token: Token;
  quantity?: number;
  usd?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface TradeQuote {
  side: TradeSide;
  quantity: number;
  executionPrice: number;
  total: number;
  fee: number;
  net: number;
}

interface TradingApi {
  state: TradingState;
  loading: boolean;
  fee: number;
  slippage: number;
  summary: PortfolioSummary;
  positionFor: (tokenId: string) => TradingState['positions'][number] | undefined;
  quote: (side: TradeSide, token: Token, quantity: number) => TradeQuote;
  execute: (req: TradeRequest) => Promise<Transaction>;
  setOrders: (tokenId: string, orders: { stopLoss: number | null; takeProfit: number | null }) => Promise<void>;
  reset: () => Promise<void>;
  reload: () => Promise<void>;
}

const TradingContext = createContext<TradingApi | null>(null);

/** Paper portfolio stored per account on the server; SL/TP are enforced server-side. */
export function TradingProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { tokenMap, portfolioVersion } = useMarket();
  const [state, setState] = useState<TradingState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [fee, setFee] = useState(0.003);
  const [slippage, setSlippage] = useState(0.005);

  const reload = useCallback(async () => {
    const r = await get<{ portfolio: TradingState; fee: number; slippage: number }>('/api/portfolio');
    setState(r.portfolio);
    setFee(r.fee);
    setSlippage(r.slippage);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      setState(EMPTY);
      return;
    }
    setLoading(true);
    reload()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [status, reload, portfolioVersion]);

  const summary = useMemo(() => summarizePortfolio(state, tokenMap), [state, tokenMap]);
  const positionFor = useCallback((id: string) => state.positions.find((p) => p.tokenId === id), [state.positions]);

  const quote = useCallback(
    (side: TradeSide, token: Token, quantity: number): TradeQuote => {
      const executionPrice = token.price * (side === 'buy' ? 1 + slippage : 1 - slippage);
      const total = quantity * executionPrice;
      const f = total * fee;
      return { side, quantity, executionPrice, total, fee: f, net: side === 'buy' ? -(total + f) : total - f };
    },
    [fee, slippage],
  );

  const execute = useCallback(async (req: TradeRequest) => {
    const r = await post<{ transaction: Transaction; portfolio: TradingState }>('/api/portfolio/trades', {
      mint: req.token.id,
      side: req.side,
      quantity: req.quantity,
      usd: req.usd,
      stopLoss: req.stopLoss,
      takeProfit: req.takeProfit,
    });
    setState(r.portfolio);
    return r.transaction;
  }, []);

  const setOrders = useCallback(async (tokenId: string, orders: { stopLoss: number | null; takeProfit: number | null }) => {
    const r = await patch<{ portfolio: TradingState }>(`/api/portfolio/positions/${encodeURIComponent(tokenId)}`, orders);
    setState(r.portfolio);
  }, []);

  const reset = useCallback(async () => {
    const r = await post<{ portfolio: TradingState }>('/api/portfolio/reset');
    setState(r.portfolio);
  }, []);

  const value = useMemo(
    () => ({ state, loading, fee, slippage, summary, positionFor, quote, execute, setOrders, reset, reload }),
    [state, loading, fee, slippage, summary, positionFor, quote, execute, setOrders, reset, reload],
  );
  return <TradingContext.Provider value={value}>{children}</TradingContext.Provider>;
}

export function useTrading(): TradingApi {
  const ctx = useContext(TradingContext);
  if (!ctx) throw new Error('useTrading must be used within TradingProvider');
  return ctx;
}
