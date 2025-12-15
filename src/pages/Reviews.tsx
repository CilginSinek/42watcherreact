import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ThemeToggle } from '../components/ThemeToggle';

interface Review {
  _id: string;
  campusId: number;
  evaluator: string;
  evaluated: string;
  project: string;
  date: string;
  score: number | null;
  status: string | null;
  evaluatorComment: string | null;
  createdAt: string;
  evaluatorData?: {
    id: number;
    login: string;
    displayname: string;
    image?: {
      link: string;
      versions: {
        small: string;
      };
    };
  } | null;
  evaluatedData?: {
    id: number;
    login: string;
    displayname: string;
    image?: {
      link: string;
      versions: {
        small: string;
      };
    };
  } | null;
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function Reviews() {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Filters
  const [projectName, setProjectName] = useState('');
  const [campusId, setCampusId] = useState('');
  const [evaluatorLogin, setEvaluatorLogin] = useState('');
  const [evaluatedLogin, setEvaluatedLogin] = useState('');
  const [score, setScore] = useState('');
  const [status, setStatus] = useState('');
  const [dateFilter, setDateFilter] = useState<'after' | 'before' | 'between'>('after');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  const [statuses, setStatuses] = useState<string[]>([]);
  const [projectNames, setProjectNames] = useState<string[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0
  });

  const fetchMetadata = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const [statusesRes, projectsRes] = await Promise.all([
        axios.get(`${apiUrl}/api/reviews/statuses`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${apiUrl}/api/reviews/projectNames`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ]);
      setStatuses(statusesRes.data.statuses || []);
      setProjectNames(projectsRes.data.projectNames || []);
      console.log('Statuses:', statusesRes.data);
      console.log('Project Names:', projectsRes.data);
    } catch (error: unknown) {
      const err = error as { response?: { status: number; data?: { message?: string } } };
      if (err.response?.status === 403 && err.response?.data?.message?.includes('banned')) {
        const reason = err.response.data.message.replace('User is banned: ', '').replace('User is banned', '');
        navigate('/banned', { state: { reason } });
      }
      console.error('Error fetching metadata:', error);
    }
  };

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
        ...(projectName && { projectName }),
        ...(campusId && { campusId }),
        ...(evaluatorLogin && { evaluatorLogin }),
        ...(evaluatedLogin && { evaluatedLogin }),
        ...(score && { score }),
        ...(status && { status }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && dateFilter === 'between' && { dateTo }),
        ...(dateFilter && { dateFilter })
      });

      const apiUrl = import.meta.env.VITE_API_URL || '';
      const response = await axios.get(`${apiUrl}/api/reviews?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setReviews(response.data.reviews || []);
      setPagination(response.data.pagination);
    } catch (error: unknown) {
      const err = error as { response?: { status: number; data?: { message?: string } } };
      if (err.response?.status === 403 && err.response?.data?.message?.includes('banned')) {
        const reason = err.response.data.message.replace('User is banned: ', '').replace('User is banned', '');
        navigate('/banned', { state: { reason } });
      }
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchMetadata();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchReviews();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, token]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchReviews();
  };

  const handleReset = () => {
    setSearch('');
    setProjectName('');
    setCampusId('');
    setEvaluatorLogin('');
    setEvaluatedLogin('');
    setScore('');
    setStatus('');
    setDateFilter('after');
    setDateFrom('');
    setDateTo('');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-600 bg-gray-100';
    if (score >= 100) return 'text-green-600 bg-green-100';
    if (score >= 75) return 'text-blue-600 bg-blue-100';
    if (score >= 50) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
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
                <Link to="/students" className="text-(--text-secondary) hover:text-(--text-primary) transition pb-1">Students</Link>
                <Link to="/reviews" className="text-(--primary) border-b-2 border-(--primary) pb-1">Reviews</Link>
              </nav>
            </div>

            <div className="flex items-center gap-4 flex-wrap justify-end">
              <ThemeToggle />
              {user && (
                <div className="flex items-center gap-3 text-sm sm:text-base">
                  <img src={user.image.link || "/placeholder.svg"} alt={user.login} className="w-8 h-8 rounded-full object-cover" />
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
          <h2 className="text-xl font-bold text-(--text-primary) mb-4">🔍 Search Reviews</h2>
          
          <form onSubmit={handleSearch} className="space-y-4">
            {/* General Search */}
            <div className="flex gap-3 flex-col sm:flex-row">
              <input
                type="text"
                placeholder="Search in comments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input flex-1 text-sm sm:text-base"
              />
              <button type="submit" className="btn btn-primary px-4 sm:px-6 whitespace-nowrap">
                Search
              </button>
              <button type="button" onClick={handleReset} className="btn-secondary px-4 sm:px-6 whitespace-nowrap">
                Reset
              </button>
            </div>

            {/* Detailed Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Project Name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  list="project-names"
                  className="input py-2 text-sm w-full"
                />
                <datalist id="project-names">
                  {projectNames.map((p, index) => (
                    <option key={index} value={p} />
                  ))}
                </datalist>
              </div>
              
              <input
                type="text"
                placeholder="Evaluator Login"
                value={evaluatorLogin}
                onChange={(e) => setEvaluatorLogin(e.target.value)}
                className="input py-2 text-sm"
              />
              
              <input
                type="text"
                placeholder="Evaluated Login (Project Owner)"
                value={evaluatedLogin}
                onChange={(e) => setEvaluatedLogin(e.target.value)}
                className="input py-2 text-sm"
              />

              <select
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
                className="input py-2 text-sm"
              >
                <option value="">All Campuses</option>
                <option value="49">Istanbul (49)</option>
                <option value="50">Kocaeli (50)</option>
              </select>

              <input
                type="number"
                placeholder="Score (e.g. 100, 75, 0)"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="input py-2 text-sm"
              />

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="input py-2 text-sm"
              >
                <option value="">All Statuses</option>
                {statuses.map((s, index) => (
                  <option key={index} value={s}>
                    {s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </option>
                ))}
              </select>

              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as 'after' | 'before' | 'between')}
                className="input py-2 text-sm"
              >
                <option value="after">After Date</option>
                <option value="before">Before Date</option>
                <option value="between">Between Dates</option>
              </select>
            </div>

            {/* Date Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-(--text-tertiary) mb-1">
                  {dateFilter === 'between' ? 'From Date' : dateFilter === 'after' ? 'After Date' : 'Before Date'}
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="input py-2 text-sm w-full"
                />
              </div>
              
              {dateFilter === 'between' && (
                <div>
                  <label className="block text-sm text-(--text-tertiary) mb-1">To Date</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="input py-2 text-sm w-full"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-between items-center text-xs sm:text-sm text-(--text-secondary)">
              <span>Total: {pagination.total} reviews</span>
              <span>Page {pagination.page} / {pagination.totalPages}</span>
            </div>
          </form>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 rounded-full border-2 border-(--primary) border-t-transparent animate-spin mb-3"></div>
            <p className="text-(--text-secondary) text-sm">Loading reviews...</p>
          </div>
        ) : reviews.length > 0 ? (
          <>
            {/* Reviews List */}
            <div className="space-y-4 mb-8">
              {reviews.map((review) => (
                <div key={review._id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex flex-col gap-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-(--text-primary) mb-1">
                          {review.project}
                        </h3>
                        <p className="text-sm text-(--text-tertiary)">
                          {formatDate(review.date)}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-wrap">
                        {review.status && (
                          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                            🚩 {review.status}
                          </span>
                        )}
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${getScoreColor(review.score)}`}>
                          {review.score !== null ? `${review.score} pts` : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* People */}
                    <div className="flex flex-wrap gap-6">
                      {/* Evaluator */}
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-(--text-tertiary)">Evaluator:</div>
                        {review.evaluatorData ? (
                          <Link 
                            to={`/students/${review.evaluatorData.login}`}
                            className="flex items-center gap-2 hover:opacity-80 transition"
                          >
                            {review.evaluatorData.image && (
                              <img 
                                src={review.evaluatorData.image.versions.small} 
                                alt={review.evaluatorData.login}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            )}
                            <div>
                              <p className="text-sm font-semibold text-(--text-primary)">
                                {review.evaluatorData.displayname}
                              </p>
                              <p className="text-xs text-(--text-tertiary)">@{review.evaluatorData.login}</p>
                            </div>
                          </Link>
                        ) : (
                          <span className="text-sm text-(--text-secondary)">{review.evaluator}</span>
                        )}
                      </div>

                      <div className="text-(--text-tertiary)">→</div>

                      {/* Evaluated */}
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-(--text-tertiary)">Project Owner:</div>
                        {review.evaluatedData ? (
                          <Link 
                            to={`/students/${review.evaluatedData.login}`}
                            className="flex items-center gap-2 hover:opacity-80 transition"
                          >
                            {review.evaluatedData.image && (
                              <img 
                                src={review.evaluatedData.image.versions.small} 
                                alt={review.evaluatedData.login}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            )}
                            <div>
                              <p className="text-sm font-semibold text-(--text-primary)">
                                {review.evaluatedData.displayname}
                              </p>
                              <p className="text-xs text-(--text-tertiary)">@{review.evaluatedData.login}</p>
                            </div>
                          </Link>
                        ) : (
                          <span className="text-sm text-(--text-secondary)">{review.evaluated}</span>
                        )}
                      </div>
                    </div>

                    {/* Comment */}
                    {review.evaluatorComment && (
                      <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-4 rounded-lg">
                        <p className="text-sm text-(--text-primary) whitespace-pre-wrap">{review.evaluatorComment}</p>
                      </div>
                    )}
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
            <div className="text-4xl sm:text-5xl mb-3">💬</div>
            <h3 className="text-base sm:text-lg font-semibold text-(--text-primary) mb-1">No Reviews Found</h3>
            <p className="text-(--text-secondary) text-sm">
              Try adjusting your filters to find reviews.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderColor: 'var(--border)' }} className="border-t mt-8 sm:mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-(--text-tertiary) text-xs sm:text-sm">
          <p>Made with by <a href="https://sinek.dev" target="_blank" rel="noopener noreferrer" className="text-(--primary) hover:opacity-80">sinek.dev</a></p>
        </div>
      </footer>
    </div>
  );
}

export default Reviews;
