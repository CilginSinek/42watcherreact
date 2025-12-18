import { createContext, useState } from 'react';
import type { ReactNode } from 'react';

interface CacheContextType {
  dashboardCache: Record<string, unknown>;
  setDashboardCache: (campusId: string, data: unknown) => void;
  getDashboardCache: (campusId: string) => unknown;
  studentsCache: Record<string, unknown>;
  setStudentsCache: (key: string, data: unknown) => void;
  getStudentsCache: (key: string) => unknown;
  studentsFilters: unknown;
  setStudentsFilters: (filters: unknown) => void;
  getStudentsFilters: () => unknown;
  reviewsCache: Record<string, unknown>;
  setReviewsCache: (key: string, data: unknown) => void;
  getReviewsCache: (key: string) => unknown;
  clearCache: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const CacheContext = createContext<CacheContextType | undefined>(undefined);

export function CacheProvider({ children }: { children: ReactNode }) {
  const [dashboardCache, setDashboardCacheState] = useState<Record<string, unknown>>({});
  const [studentsCache, setStudentsCacheState] = useState<Record<string, unknown>>({});
  const [studentsFilters, setStudentsFiltersState] = useState<unknown>(null);
  const [reviewsCache, setReviewsCacheState] = useState<Record<string, unknown>>({});

  const setDashboardCache = (campusId: string, data: unknown) => {
    setDashboardCacheState(prev => ({ ...prev, [campusId]: data }));
  };

  const getDashboardCache = (campusId: string) => {
    return dashboardCache[campusId];
  };

  const setStudentsCache = (key: string, data: unknown) => {
    setStudentsCacheState(prev => ({ ...prev, [key]: data }));
  };

  const getStudentsCache = (key: string) => {
    return studentsCache[key];
  };

  const setStudentsFilters = (filters: unknown) => {
    setStudentsFiltersState(filters);
  };

  const getStudentsFilters = () => {
    return studentsFilters;
  };

  const setReviewsCache = (key: string, data: unknown) => {
    setReviewsCacheState(prev => ({ ...prev, [key]: data }));
  };

  const getReviewsCache = (key: string) => {
    return reviewsCache[key];
  };

  const clearCache = () => {
    setDashboardCacheState({});
    setStudentsCacheState({});
    setStudentsFiltersState(null);
    setReviewsCacheState({});
  };

  return (
    <CacheContext.Provider
      value={{
        dashboardCache,
        setDashboardCache,
        getDashboardCache,
        studentsCache,
        setStudentsCache,
        getStudentsCache,
        studentsFilters,
        setStudentsFilters,
        getStudentsFilters,
        reviewsCache,
        setReviewsCache,
        getReviewsCache,
        clearCache,
      }}
    >
      {children}
    </CacheContext.Provider>
  );
}
