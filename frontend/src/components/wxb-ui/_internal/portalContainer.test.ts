import { resolvePortalContainer, resolvePopupContainer } from './portalContainer';

// jsdom 不实现 Fullscreen API,document.fullscreenElement 默认是 undefined。
// 用 Object.defineProperty 在每个用例里临时改写,模拟「进入/退出全屏」。
function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => el,
  });
}

describe('resolvePortalContainer (Modal/Drawer getContainer 默认)', () => {
  afterEach(() => {
    setFullscreenElement(null);
  });

  it('非全屏时返回 document.body', () => {
    setFullscreenElement(null);
    expect(resolvePortalContainer()).toBe(document.body);
  });

  it('全屏时返回当前全屏元素', () => {
    const fsEl = document.createElement('div');
    setFullscreenElement(fsEl);
    expect(resolvePortalContainer()).toBe(fsEl);
  });
});

describe('resolvePopupContainer (Select/DatePicker 等下拉 getPopupContainer 默认)', () => {
  afterEach(() => {
    setFullscreenElement(null);
  });

  it('非全屏时返回 document.body(等价 antd 默认,不改变非全屏行为)', () => {
    setFullscreenElement(null);
    const trigger = document.createElement('input');
    const parent = document.createElement('div');
    parent.appendChild(trigger);
    expect(resolvePopupContainer(trigger)).toBe(document.body);
  });

  it('全屏时就近返回触发器的 parentElement(留在全屏元素内)', () => {
    const fsEl = document.createElement('div');
    setFullscreenElement(fsEl);
    const trigger = document.createElement('input');
    const parent = document.createElement('div');
    parent.appendChild(trigger);
    expect(resolvePopupContainer(trigger)).toBe(parent);
  });

  it('全屏但触发器无 parentElement 时回退到 document.body', () => {
    const fsEl = document.createElement('div');
    setFullscreenElement(fsEl);
    const orphan = document.createElement('input'); // 未挂载,parentElement 为 null
    expect(resolvePopupContainer(orphan)).toBe(document.body);
  });
});
