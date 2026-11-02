"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { createInitialState, demoReducer, type DemoAction, type DemoState } from "./state";

const DemoContext = createContext<{ state: DemoState; dispatch: Dispatch<DemoAction> } | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, undefined, createInitialState);
  return <DemoContext.Provider value={{ state, dispatch }}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("Demo components must be rendered inside DemoProvider.");
  return context;
}
