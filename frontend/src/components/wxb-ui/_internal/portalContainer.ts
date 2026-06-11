/**
 * Portal container resolution for wxb-ui overlays under the native Fullscreen API.
 *
 * 当甘特容器进入浏览器「top layer(顶层)」时,任何 portal 到 document.body 的浮层
 * (Modal / Drawer / Select 下拉 / Toast …)都会被压在全屏元素之下而不可见。
 * 这里集中提供「优先挂进当前全屏元素」的兜底解析:非全屏时 document.fullscreenElement
 * 为 null,行为与原先(挂 document.body)完全一致,因此对非全屏场景零影响。
 */

/**
 * Modal / Drawer 的 getContainer 默认值用:返回当前全屏元素,否则 document.body。
 * 仅在调用方未显式传 getContainer 时作为默认,显式传入则尊重其值。
 *
 * 已知局限:antd 只在浮层「挂载那一刻」求值 getContainer。若 Modal/Drawer 已打开、
 * 随后用户退出全屏(ESC / 工具栏),承载它的全屏元素离开 top layer,容器不会重算,
 * 弹窗可能错位或残留在已折叠的旧子树里。宿主应在退全屏时主动关闭这些已开弹窗——
 * 例:ProcessTemplateV3Editor 监听 fullscreenchange,退全屏时关闭其业务弹窗;
 * GanttChart 同样在该事件里关掉自身右键菜单。详见 docs/pending-decisions.md。
 */
export function resolvePortalContainer(): HTMLElement {
  if (typeof document === 'undefined') return undefined as unknown as HTMLElement;
  return (document.fullscreenElement as HTMLElement | null) ?? document.body;
}

/**
 * Trigger 类浮层(Select / DatePicker / Tooltip / Popover / Dropdown / Popconfirm …)
 * 的 getPopupContainer 默认值用。
 *
 * - 处于全屏时:就近渲染到触发器的 parentElement,使弹窗内嵌的下拉跟随触发器留在
 *   全屏元素内(沿用批次链已验证的 trigger.parentElement 模式),解决嵌套 portal。
 * - 非全屏时:保持 antd 默认(document.body),不改变全站既有定位行为。
 */
export function resolvePopupContainer(trigger: HTMLElement): HTMLElement {
  if (typeof document !== 'undefined' && document.fullscreenElement) {
    return trigger?.parentElement ?? document.body;
  }
  return document.body;
}
