export const DEPARTMENTS = [
  { code: 'BSIT', name: 'Bachelor of Science in Information Technology' },
  { code: 'BSHM', name: 'Bachelor of Science in Hospitality Management' },
  { code: 'BEED', name: 'Bachelor of Elementary Education' },
  { code: 'BSED', name: 'Bachelor of Secondary Education' },
] as const;

export type DepartmentCode = (typeof DEPARTMENTS)[number]['code'];

export function isDepartmentCode(value: string): value is DepartmentCode {
  return DEPARTMENTS.some((department) => department.code === value);
}
