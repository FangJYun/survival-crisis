/** 仅暴露生命周期，不读取账号或凭据。 */
interface WechatLifecycle {
    onHide(callback: () => void): void;
    onShow(callback: () => void): void;
    offHide(callback: () => void): void;
    offShow(callback: () => void): void;
}
export function watchLifecycle(onHide: () => void, onShow: () => void): () => void {
    const wx = (globalThis as unknown as { wx?: WechatLifecycle }).wx;
    if (wx) {
        wx.onHide(onHide); wx.onShow(onShow);
        return () => { wx.offHide(onHide); wx.offShow(onShow); };
    }
    if (typeof document === 'undefined') return () => {};
    const changed = () => document.hidden ? onHide() : onShow();
    document.addEventListener('visibilitychange', changed);
    const blur = () => onHide(), focus = () => { if (!document.hidden) onShow(); };
    globalThis.addEventListener('blur', blur); globalThis.addEventListener('focus', focus);
    return () => { document.removeEventListener('visibilitychange', changed); globalThis.removeEventListener('blur', blur); globalThis.removeEventListener('focus', focus); };
}
