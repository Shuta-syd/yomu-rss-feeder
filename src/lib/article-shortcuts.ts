/** Leave arrow keys to editors, widgets, dialogs and browser shortcuts. */
export function articleShortcut(event: KeyboardEvent): "previous" | "next" | null {
  if (event.defaultPrevented || event.isComposing || event.repeat ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return null;
  const target = event.target as Element | null;
  if (target?.closest?.('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], [role="combobox"], [role="listbox"], [role="menu"], [role="tablist"], [role="dialog"], [role="alertdialog"], dialog')) return null;
  return event.key === "ArrowLeft" ? "previous" : "next";
}
