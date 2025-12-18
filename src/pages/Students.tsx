import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCache } from '../contexts/useCache';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ThemeToggle } from '../components/ThemeToggle';

interface Student {
  id: number;
  login: string;
  displayname: string;
  email: string;
  image: {
    link: string;
    versions: {
      large: string;
      medium: string;
      small: string;
      micro: string;
    };
  };
  correction_point: number;
  wallet: number;
  location: string | null;
  'active?': boolean;
  'alumni?': boolean;
  'staff?': boolean;
  sinker?: boolean;
  freeze?: boolean;
  blackholed?: boolean;
  is_piscine: boolean;
  is_trans: boolean;
  grade?: string | null;
  pool_month?: string;
  pool_year?: string;
  project_count?: number;
  cheat_count?: number;
  has_cheats?: boolean;
  locationHistory?: { month: string; duration: number }[];
}

interface Pool {
  month: string;
  year: string;
  count: number;
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function Students() {
  const { user, logout, token } = useAuth();
  const { getStudentsCache, setStudentsCache, getStudentsFilters, setStudentsFilters } = useCache();
  const navigate = useNavigate();
  
  // Cache'den filter state'ini yükle - useState lazy initialization ile
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => {
    const cached = getStudentsFilters() as { search?: string } | null;
    return cached?.search || '';
  });
  const [status, setStatus] = useState(() => {
    const cached = getStudentsFilters() as { status?: string } | null;
    return cached?.status || 'all';
  });
  const [campusId, setCampusId] = useState(() => {
    const cached = getStudentsFilters() as { campusId?: string } | null;
    return cached?.campusId || 'all';
  });
  const [poolMonth, setPoolMonth] = useState(() => {
    const cached = getStudentsFilters() as { poolMonth?: string } | null;
    return cached?.poolMonth || '';
  });
  const [poolYear, setPoolYear] = useState(() => {
    const cached = getStudentsFilters() as { poolYear?: string } | null;
    return cached?.poolYear || '';
  });
  const [pools, setPools] = useState<Pool[]>([]);
  const [sortBy, setSortBy] = useState(() => {
    const cached = getStudentsFilters() as { sortBy?: string } | null;
    return cached?.sortBy || 'login';
  });
  const [order, setOrder] = useState<'asc' | 'desc'>(() => {
    const cached = getStudentsFilters() as { order?: 'asc' | 'desc' } | null;
    return cached?.order || 'asc';
  });
  const [pagination, setPagination] = useState<PaginationInfo>(() => {
    const cached = getStudentsFilters() as { page?: number } | null;
    return {
      total: 0,
      page: cached?.page || 1,
      limit: 50,
      totalPages: 0
    };
  });

  const fetchPools = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const response = await axios.get(`${apiUrl}/api/students/pools`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPools(response.data.pools);
    } catch (error: unknown) {
      const err = error as { response?: { status: number; data?: { message?: string } } };
      if (err.response?.status === 403 && err.response?.data?.message?.includes('banned')) {
        const reason = err.response.data.message.replace('User is banned: ', '').replace('User is banned', '');
        navigate('/banned', { state: { reason } });
      }
      console.error('Error fetching pools:', error);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchPools();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Filtreleri cache'e kaydet
  useEffect(() => {
    setStudentsFilters({
      search,
      status,
      campusId,
      poolMonth,
      poolYear,
      sortBy,
      order,
      page: pagination.page
    });
  }, [search, status, campusId, poolMonth, poolYear, sortBy, order, pagination.page, setStudentsFilters]);

  // Students verisini yükle
  useEffect(() => {
    if (!token) return;

    const cacheKey = `${campusId}-${status}-${poolMonth}-${poolYear}-${sortBy}-${order}-${search}-${pagination.page}`;
    const cachedData = getStudentsCache(cacheKey);
    
    if (cachedData) {
      const cached = cachedData as { students: Student[]; pagination: PaginationInfo };
      setStudents(cached.students);
      setPagination(prev => ({
        ...prev,
        total: cached.pagination.total,
        totalPages: cached.pagination.totalPages
      }));
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: pagination.page.toString(),
          limit: pagination.limit.toString(),
          sortBy,
          order,
          ...(search && { search }),
          ...(status !== 'all' && { status }),
          ...(campusId !== 'all' && { campusId }),
          ...(poolMonth && { poolMonth }),
          ...(poolYear && { poolYear })
        });

        const apiUrl = import.meta.env.VITE_API_URL || '';
        const response = await axios.get(`${apiUrl}/api/students?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setStudents(response.data.students);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total,
          totalPages: response.data.pagination.totalPages
        }));
        setStudentsCache(cacheKey, response.data);
        setError(null);
      } catch (error: unknown) {
        const err = error as { response?: { status: number; data?: { message?: string } }; message?: string };
        if (err.response?.status === 403 && err.response?.data?.message?.includes('banned')) {
          const reason = err.response.data.message.replace('User is banned: ', '').replace('User is banned', '');
          navigate('/banned', { state: { reason } });
        } else {
          const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch students';
          setError(errorMessage);
          console.error('Error fetching students:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, campusId, status, poolMonth, poolYear, sortBy, order, search, pagination.page]);

  // Scroll pozisyonunu restore et
  useEffect(() => {
    const savedScrollPos = sessionStorage.getItem('studentsScrollPos');
    if (savedScrollPos && !loading) {
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedScrollPos));
        sessionStorage.removeItem('studentsScrollPos');
      }, 100);
    }
  }, [loading]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    // useEffect otomatik olarak tetiklenecek
  };

  const handlePoolChange = (value: string) => {
    if (value === 'all') {
      setPoolMonth('');
      setPoolYear('');
    } else {
      const [month, year] = value.split('-');
      setPoolMonth(month);
      setPoolYear(year);
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const capitalizeMonth = (month: string) => {
    return month.charAt(0).toUpperCase() + month.slice(1);
  };

  const getStatusBadge = (student: Student) => {
    // Staff kontrolü en önce
    if (student['staff?']) return <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">👨‍💻 Staff</span>;
    
    // Blackholed kontrolü
    if (student.blackholed) return <span className="px-2 py-1 bg-black text-white rounded-full text-xs font-semibold">🕳️ Blackholed</span>;
    
    // Sinker kontrolü
    if (student.sinker) return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">⚓ Sinker</span>;
    
    // Freeze kontrolü
    if (student.freeze) return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">❄️ Freeze</span>;
    
    // Inactive kontrolü (grade ve alumni/active'den önce)
    if (!student['active?'] && !student['alumni?']) return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">⭕ Inactive</span>;
    
    // Grade bazlı badge göster
    if (student.grade === 'Transcender') return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">🚀 Transcender</span>;
    if (student.grade === 'Cadet') return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">👨‍🚀 Cadet</span>;
    if (student.grade === 'Piscine') return <span className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-semibold">🏊 Piscine</span>;
    
    // Alumni ve Active en sonda
    if (student['alumni?']) return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">🎓 Alumni</span>;
    if (student['active?']) return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">✅ Active</span>;
    
    return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">⭕ Inactive</span>;
  };

  const handleStudentClick = (student: Student) => {
    // Scroll pozisyonunu kaydet
    sessionStorage.setItem('studentsScrollPos', window.scrollY.toString());
    navigate(`/students/${student.login}`);
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)' }} className="min-h-screen transition-colors duration-300">
      {/* Header */}
      <header style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }} className="border-b backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <Link to="/dashboard" className="text-lg sm:text-xl font-bold text-(--text-primary) hover:text-(--primary) transition whitespace-nowrap">
                42 Watcher
              </Link>
              <nav className="flex items-center gap-6 text-sm sm:text-base">
                <Link to="/dashboard" className="text-(--text-secondary) hover:text-(--text-primary) transition pb-1">Dashboard</Link>
                <Link to="/students" className="text-(--primary) border-b-2 border-(--primary) pb-1">Students</Link>
                <Link to="/reviews" className="text-(--text-secondary) hover:text-(--text-primary) transition pb-1">Reviews</Link>
              </nav>
            </div>

            <div className="flex items-center gap-4 flex-wrap justify-end">
              <ThemeToggle />
              {user && (
                <div className="flex items-center gap-3 text-sm sm:text-base">
                  <img src={user.image?.link || "/placeholder.svg"} alt={user.login} className="w-8 h-8 rounded-full object-cover" />
                  <span className="text-(--text-secondary) hidden sm:inline">{user.login}</span>
                  <button onClick={logout} className="btn-secondary py-1 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap">
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        <div className="card space-y-4 mb-8">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-3 flex-col sm:flex-row">
              <input
                type="text"
                placeholder="Search by login or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input flex-1 text-sm sm:text-base"
              />
              <button type="submit" className="btn btn-primary px-4 sm:px-6 whitespace-nowrap">
                Search
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                className="input py-2 text-sm"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="alumni">Alumni</option>
                <option value="staff">Staff</option>
                <option value="blackholed">Blackholed</option>
                <option value="transcender">Transcender</option>
                <option value="cadet">Cadet</option>
                <option value="piscine">Piscine</option>
                <option value="sinker">Sinker</option>
                <option value="freeze">Freeze</option>
                <option value="inactive">Inactive</option>
                <option value="test">Test</option>
              </select>

              <select
                value={campusId}
                onChange={(e) => {
                  setCampusId(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                className="input py-2 text-sm"
              >
                <option value="all">All Campuses</option>
                <option value="50">Kocaeli</option>
                <option value="49">Istanbul</option>
              </select>

              <select
                value={poolMonth && poolYear ? `${poolMonth}-${poolYear}` : 'all'}
                onChange={(e) => handlePoolChange(e.target.value)}
                className="input py-2 text-sm"
              >
                <option value="all">All Pools</option>
                {pools.map((pool) => (
                  <option key={`${pool.month}-${pool.year}`} value={`${pool.month}-${pool.year}`}>
                    {capitalizeMonth(pool.month)} {pool.year} ({pool.count})
                  </option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="input py-2 text-sm"
              >
                <option value="login">Sort by Login</option>
                <option value="level">Level</option>
                <option value="correction_point">Correction Points</option>
                <option value="wallet">Wallet</option>
                <option value="project_count">Project Count</option>
                <option value="cheat_count">Cheat Count</option>
                <option value="cheat_date">Cheat Date</option>
                <option value="godfather_count">Godfather Count</option>
                <option value="children_count">Children Count</option>
                <option value="log_time">Log Time</option>
                <option value="evo_performance">Evo Performance</option>
                <option value="feedback_count">Feedback Count</option>
                <option value="avg_rating">Average Rating</option>
              </select>

              <button
                type="button"
                onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
                className="btn-secondary px-4 py-2 text-sm whitespace-nowrap"
              >
                {order === 'asc' ? '↑ Ascending' : '↓ Descending'}
              </button>

              <div className="flex gap-2 text-xs sm:text-sm text-(--text-secondary) items-center col-span-1 sm:col-span-2 lg:col-span-1">
                <span className="truncate">Total: {pagination.total}</span>
                <span>|</span>
                <span className="truncate">Page {pagination.page}/{pagination.totalPages}</span>
              </div>
            </div>
          </form>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 rounded-full border-2 border-(--primary) border-t-transparent animate-spin mb-3"></div>
            <p className="text-(--text-secondary) text-sm">Loading students...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-6xl mb-4">⚠️</div>
            <p className="text-red-500 font-semibold text-lg mb-2">Error Loading Students</p>
            <p className="text-(--text-secondary) text-sm mb-4">{error}</p>
            <button onClick={() => window.location.reload()} className="btn-primary px-6 py-2">
              Retry
            </button>
          </div>
        ) : students.length > 0 ? (
          <>
            {/* Students Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
              {students.map((student) => (
                <div
                  key={student.id}
                  onClick={() => handleStudentClick(student)}
                  className="card-hover group"
                >
                  <div className="flex gap-4 flex-col sm:flex-row">
                    <img
                      src={student.image.versions.medium || "/placeholder.svg"}
                      alt={student.login}
                      className="w-16 h-16 rounded-xl object-cover shadow-md group-hover:scale-105 transition-transform duration-300 shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <Link 
                        to={`/students/${student.login}`}
                        className="font-semibold text-(--text-primary) truncate hover:text-(--primary) transition text-sm sm:text-base block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {student.displayname || student.login}
                      </Link>
                      <a
                        href={`https://profile.intra.42.fr/users/${student.login}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-(--text-tertiary) hover:text-(--primary) text-xs sm:text-sm truncate block transition"
                        onClick={(e) => e.stopPropagation()}
                      >
                        @{student.login}
                      </a>

                      <div className="flex gap-2 mt-2 flex-wrap">
                        {getStatusBadge(student)}
                        {student.has_cheats && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">⚠️ Cheat</span>
                        )}
                        {student.pool_month && student.pool_year && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                            🏊 {capitalizeMonth(student.pool_month)} {student.pool_year}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-2 rounded-lg">
                          <p className="text-(--text-tertiary)">Points</p>
                          <p className="text-(--primary) font-bold">{student.correction_point}</p>
                        </div>
                        <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-2 rounded-lg">
                          <p className="text-(--text-tertiary)">Wallet</p>
                          <p className="text-(--primary) font-bold">{student.wallet}₳</p>
                        </div>
                      </div>

                      {/* Project Count - sadece 0'dan büyükse göster */}
                      {student.project_count !== undefined && student.project_count > 0 && (
                        <p className="text-(--text-tertiary) text-xs mt-2">📦 {student.project_count} project{student.project_count > 1 ? 's' : ''}</p>
                      )}

                      {student.location && (
                        <p className="text-(--text-tertiary) text-xs truncate mt-1">📍 {student.location}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 sm:gap-4 py-8 flex-wrap">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <span className="text-(--text-secondary) text-sm">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <div className="text-4xl sm:text-5xl mb-3">🔍</div>
            <h3 className="text-base sm:text-lg font-semibold text-(--text-primary) mb-1">No Results Found</h3>
            <p className="text-(--text-secondary) text-sm">
              Try adjusting your filters to find what you're looking for.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderColor: 'var(--border)' }} className="border-t mt-8 sm:mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-(--text-tertiary) text-xs sm:text-sm space-y-3">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <Link to="/privacy-policy" className="hover:text-(--primary) transition">Gizlilik Politikası</Link>
            <span className="hidden sm:inline">•</span>
            <Link to="/kvkk" className="hover:text-(--primary) transition">KVKK</Link>
            <span className="hidden sm:inline">•</span>
            <Link to="/cookie-policy" className="hover:text-(--primary) transition">Çerez Politikası</Link>
            <span className="hidden sm:inline">•</span>
            <Link to="/terms" className="hover:text-(--primary) transition">Kullanım Koşulları</Link>
            <span className="hidden sm:inline">•</span>
            <Link to="/disclaimer" className="hover:text-(--primary) transition">Yasal Uyarı</Link>
            <span className="hidden sm:inline">•</span>
            <Link to="/contact" className="hover:text-(--primary) transition">İletişim</Link>
          </div>
          <p>Made with by <a href="https://sinek.dev" target="_blank" rel="noopener noreferrer" className="text-(--primary) hover:opacity-80">sinek.dev</a></p>
        </div>
      </footer>
    </div>
  );
}

export default Students;
