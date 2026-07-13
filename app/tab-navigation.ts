export function nextTabIndex(
  currentIndex: number,
  tabCount: number,
  key: string,
): number | null {
  if (tabCount < 1) return null;
  const current = Math.min(Math.max(0, currentIndex), tabCount - 1);

  if (key === "Home") return 0;
  if (key === "End") return tabCount - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % tabCount;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + tabCount) % tabCount;
  return null;
}
