'use client';

import { createContext, useState, ReactNode } from 'react';

interface CacheContextType {
  dashboardCache: Record<string, unknown>;
  setDashboardCache: (campusId: string, data: unknown) => void;
  getDashboardCache: (campusId: string) => unknown;
  studentsData: unknown;
  setStudentsData: (data: unknown) => void;
  clearCache: () => void;
}

export const CacheContext = createContext<CacheContextType | undefined>(undefined);

export function CacheProvider({ children }: { children: ReactNode }) {
  const [dashboardCache, setDashboardCacheState] = useState<Record<string, unknown>>({});
  const [studentsData, setStudentsData] = useState<unknown>(null);

  const setDashboardCache = (campusId: string, data: unknown) => {
    setDashboardCacheState(prev => ({ ...prev, [campusId]: data }));
  };

  const getDashboardCache = (campusId: string) => {
    return dashboardCache[campusId];
  };

  const clearCache = () => {
    setDashboardCacheState({});
    setStudentsData(null);
  };

  return (
    <CacheContext.Provider
      value={{
        dashboardCache,
        setDashboardCache,
        getDashboardCache,
        studentsData,
        setStudentsData,
        clearCache,
      }}
    >
      {children}
    </CacheContext.Provider>
  );
}
