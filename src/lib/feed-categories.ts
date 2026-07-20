export const UNCATEGORIZED_CATEGORY = "未分類";

export type AddFeedCategoryMode = "existing" | "new";

export function buildExistingCategoryOptions(categories: string[]): string[] {
  const uniqueCategories = new Set(
    categories.map((category) => category.trim()).filter(Boolean),
  );
  uniqueCategories.delete(UNCATEGORIZED_CATEGORY);

  return [
    UNCATEGORIZED_CATEGORY,
    ...Array.from(uniqueCategories).sort((a, b) => a.localeCompare(b, "ja")),
  ];
}

export function resolveAddFeedCategory(
  mode: AddFeedCategoryMode,
  existingCategory: string,
  newCategory: string,
): string | undefined {
  const category = mode === "new" ? newCategory.trim() : existingCategory.trim();
  return category || undefined;
}
