"use client";

/**
 * Board multi-select - a tiny context so a `TaskCard` can become a selection
 * checkbox without every board/column/swimlane in between having to thread
 * select props. The default (no provider) is "not selectable", so cards behave
 * exactly as before unless the board turns select mode on.
 */

import { createContext, useContext } from "react";

export interface SelectionState {
  selectable: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
}

const DEFAULT: SelectionState = {
  selectable: false,
  isSelected: () => false,
  toggle: () => {},
};

const SelectionContext = createContext<SelectionState>(DEFAULT);

export const SelectionProvider = SelectionContext.Provider;

export function useSelection(): SelectionState {
  return useContext(SelectionContext);
}
