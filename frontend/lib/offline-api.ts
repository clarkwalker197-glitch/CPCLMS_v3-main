import type { LocalBook, LocalRecord } from './offline-types';

export function searchCachedBooks(
  books: LocalBook[],
  params?: Record<string, string>,
  categories: LocalRecord[] = []
): LocalBook[] {
  const get = (key: string) => params?.[key]?.trim().toLocaleLowerCase() || '';
  const search = get('search');
  const categoryId = params?.categoryId || '';
  const categoryMain = params?.categoryMain || '';
  const classification = get('classificationNumber');
  const categoryIds = new Set<string>();
  if (categoryId) {
    categoryIds.add(categoryId);
    let currentIds = [categoryId];
    while (currentIds.length) {
      const children = categories
        .filter((category) => currentIds.includes(String(category.parentId || '')))
        .map((category) => category.id)
        .filter((id) => !categoryIds.has(id));
      children.forEach((id) => categoryIds.add(id));
      currentIds = children;
    }
  }
  const filtered = books.filter((book) => {
    const category = book.category as Record<string, unknown> | undefined;
    const searchable = [
      book.title,
      book.author,
      book.isbn,
      book.classificationNumber,
      category?.name,
      category?.slug,
    ].map((value) => String(value || '').toLocaleLowerCase());
    if (search && !searchable.some((value) => value.includes(search))) return false;
    if (classification && !String(book.classificationNumber || '').toLocaleLowerCase().includes(classification)) return false;
    if (categoryId && !categoryIds.has(String(book.categoryId || ''))) return false;
    if (categoryMain) {
      const mainCode = categoryMain.padStart(3, '0')[0];
      const bookCode = String(book.classificationNumber || '').trim()[0];
      if (bookCode !== mainCode) return false;
    }
    return true;
  });

  const sort = params?.sort || 'title';
  const direction = params?.order === 'desc' ? -1 : 1;
  filtered.sort((left, right) => {
    const sortField = sort === 'classification' ? 'classificationNumber' : sort;
    const leftValue = sort === 'availability'
      ? Number(left.availableCopies || 0)
      : String(left[sortField] || '');
    const rightValue = sort === 'availability'
      ? Number(right.availableCopies || 0)
      : String(right[sortField] || '');
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction;
    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' }) * direction;
  });

  return filtered;
}
