import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

interface ScrollState {
  scrollTop: number;
  scrollLeft: number;
  zoom: number;
}

interface ScrollSyncContextValue {
  state: ScrollState;
  publish: (partial: Partial<ScrollState>) => void;
  subscribe: (listener: (state: ScrollState) => void) => () => void;
}

const DEFAULT_STATE: ScrollState = {
  scrollTop: 0,
  scrollLeft: 0,
  zoom: 1,
};

const ScrollSyncContext = createContext<ScrollSyncContextValue | null>(null);

export const ScrollSyncProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<ScrollState>(DEFAULT_STATE);
  const listenersRef = useRef(new Set<(state: ScrollState) => void>());

  const publish = useCallback((partial: Partial<ScrollState>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      if (
        next.scrollTop === prev.scrollTop &&
        next.scrollLeft === prev.scrollLeft &&
        next.zoom === prev.zoom
      ) {
        return prev;
      }
      listenersRef.current.forEach((listener) => listener(next));
      return next;
    });
  }, []);

  const subscribe = useCallback((listener: (state: ScrollState) => void) => {
    listenersRef.current.add(listener);
    listener(state);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, [state]);

  const value = useMemo<ScrollSyncContextValue>(
    () => ({
      state,
      publish,
      subscribe,
    }),
    [state, publish, subscribe],
  );

  return React.createElement(
    ScrollSyncContext.Provider,
    { value },
    children,
  );
};

export const useScrollPublisher = (): ((
  partial: Partial<ScrollState>,
) => void) => {
  const ctx = useContext(ScrollSyncContext);
  if (!ctx) {
    throw new Error('useScrollPublisher must be used within ScrollSyncProvider');
  }
  return ctx.publish;
};

export const useScrollSubscriber = (
  handler: (state: ScrollState) => void,
): void => {
  const ctx = useContext(ScrollSyncContext);
  if (!ctx) {
    throw new Error('useScrollSubscriber must be used within ScrollSyncProvider');
  }
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    return ctx.subscribe((next) => handlerRef.current(next));
  }, [ctx]);
};

export const useScrollState = (): ScrollState => {
  const ctx = useContext(ScrollSyncContext);
  if (!ctx) {
    throw new Error('useScrollState must be used within ScrollSyncProvider');
  }
  return ctx.state;
};
