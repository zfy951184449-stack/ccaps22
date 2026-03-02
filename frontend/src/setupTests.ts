const createMatchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: jest.fn().mockImplementation((query: string) => createMatchMedia(query)),
});

Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  configurable: true,
  value: window.matchMedia,
});

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('antd/lib/_util/responsiveObserver', () => {
  const responsiveArray = ['xxl', 'xl', 'lg', 'md', 'sm', 'xs'];
  const responsiveMap = {
    xs: '(max-width: 575px)',
    sm: '(min-width: 576px)',
    md: '(min-width: 768px)',
    lg: '(min-width: 992px)',
    xl: '(min-width: 1200px)',
    xxl: '(min-width: 1600px)',
  };

  const matchScreen = (screens: Record<string, boolean>, screenSizes?: Record<string, unknown>) => {
    if (!screenSizes || typeof screenSizes !== 'object') {
      return undefined;
    }
    for (const breakpoint of responsiveArray) {
      if (screens[breakpoint] && screenSizes[breakpoint] !== undefined) {
        return screenSizes[breakpoint];
      }
    }
    return undefined;
  };

  return {
    __esModule: true,
    responsiveArray,
    matchScreen,
    default: () => ({
      matchHandlers: {},
      dispatch: jest.fn(),
      subscribe: (fn: (screens: Record<string, boolean>) => void) => {
        fn({ xs: false, sm: true, md: true, lg: true, xl: false, xxl: false });
        return 1;
      },
      unsubscribe: jest.fn(),
      register: jest.fn(),
      unregister: jest.fn(),
      responsiveMap,
    }),
  };
});

export {};
