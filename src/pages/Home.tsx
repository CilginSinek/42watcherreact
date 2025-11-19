import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

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
  blackholed: boolean | null;
  'active?': boolean;
  'alumni?': boolean;
  is_piscine: boolean;
  is_trans: boolean;
  cheats?: Cheat[];
  locationHistory?: { date: string; count: number }[];
}

interface Cheat {
  project: string;
  score: number;
  date: string;
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function Home() {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0
  });
  const [stats] = useState([
    { name: 'Mon', value: 45 },
    { name: 'Tue', value: 52 },
    { name: 'Wed', value: 48 },
    { name: 'Thu', value: 61 },
    { name: 'Fri', value: 55 },
    { name: 'Sat', value: 67 },
    { name: 'Sun', value: 48 }
  ]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: '12',
        ...(search && { search })
      });

      const response = await axios.get(`/api/students?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStudents(response.data.students);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchStudents();
  };

  const getStatusBadge = (student: Student) => {
    if (student.blackholed) return <span className="badge badge-error text-xs">Blackhole</span>;
    if (student.is_piscine) return <span className="badge badge-warning text-xs">Piscine</span>;
    if (student.is_trans) return <span className="badge badge-primary text-xs">Transcender</span>;
    if (student['alumni?']) return <span className="badge badge-success text-xs">Alumni</span>;
    if (student['active?']) return <span className="badge badge-success text-xs">Active</span>;
    return <span className="badge badge-secondary text-xs">Inactive</span>;
  };

  const handleStudentClick = (student: Student) => {
    navigate(`/students/${student.login}`);
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }} className="min-h-screen transition-colors duration-300">
      {/* Header */}
      <header style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }} className="sticky top-0 z-40 border-b backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold bg-linear-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              42 Watcher
            </h1>
            {user && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <img src={user.image.link || "/placeholder.svg"} alt={user.login} className="h-10 w-10 rounded-full object-cover border border-(--primary)" />
                  <span className="text-sm font-medium">{user.login}</span>
                </div>
                <ThemeToggle />
                <button 
                  onClick={logout}
                  className="btn btn-secondary py-2 px-3 text-sm"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <p className="text-(--text-tertiary) text-sm mb-2">Total Students</p>
            <p className="text-4xl font-bold text-blue-500">{pagination.total}</p>
          </div>
          <div className="card">
            <p className="text-(--text-tertiary) text-sm mb-2">Active Users</p>
            <p className="text-4xl font-bold text-green-500">328</p>
          </div>
          <div className="card">
            <p className="text-(--text-tertiary) text-sm mb-2">Blackholed</p>
            <p className="text-4xl font-bold text-red-500">45</p>
          </div>
        </div>

        {/* Chart Section */}
        <div className="card">
          <h2 className="text-xl font-bold mb-6">Weekly Activity</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--text-tertiary)" />
              <YAxis stroke="var(--text-tertiary)" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                labelStyle={{ color: 'var(--text-primary)' }}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Search Section */}
        <div className="card space-y-4">
          <h2 className="text-xl font-bold">Search Students</h2>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              placeholder="Search by login, name, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input flex-1"
            />
            <button type="submit" className="btn btn-primary px-6">
              Search
            </button>
          </form>
        </div>

        {/* Students Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="inline-block animate-spin mb-4">
                <div className="h-10 w-10 border-4 border-(--border) border-t-(--primary) rounded-full"></div>
              </div>
              <p className="text-(--text-secondary)">Loading students...</p>
            </div>
          </div>
        ) : students.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="mb-3 text-4xl">🔍</div>
              <h3 className="text-lg font-semibold mb-1">No Results Found</h3>
              <p className="text-(--text-secondary)">Try adjusting your search criteria.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {students.map((student) => (
                <div
                  key={student.id}
                  onClick={() => handleStudentClick(student)}
                  className="card-hover group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <img 
                      src={student.image.versions.medium || "/placeholder.svg"} 
                      alt={student.login} 
                      className="h-14 w-14 rounded-lg object-cover border border-(--border)"
                    />
                    {student.cheats && student.cheats.length > 0 && (
                      <span className="inline-block px-2 py-1 bg-red-500/20 text-red-500 text-xs font-bold rounded-full">
                        🚨 {student.cheats.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold group-hover:text-(--primary) transition">
                      {student.displayname || student.login}
                    </h3>
                    <p className="text-xs text-(--text-tertiary)">@{student.login}</p>
                    
                    <div className="pt-1">
                      {getStatusBadge(student)}
                    </div>

                    <div className="pt-2 grid grid-cols-2 gap-2 text-xs">
                      <div style={{ backgroundColor: 'var(--bg-input)' }} className="rounded px-2 py-1.5">
                        <p className="text-(--text-tertiary)">Points</p>
                        <p className="font-semibold text-(--primary)">{student.correction_point}</p>
                      </div>
                      <div style={{ backgroundColor: 'var(--bg-input)' }} className="rounded px-2 py-1.5">
                        <p className="text-(--text-tertiary)">Wallet</p>
                        <p className="font-semibold text-(--primary)">{student.wallet}₳</p>
                      </div>
                    </div>

                    {/* Location Stats */}
                    {student.location && (
                      <p className="text-xs text-(--text-secondary) truncate pt-2">📍 {student.location}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-6">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <span className="text-(--text-tertiary) text-sm">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderColor: 'var(--border)' }} className="border-t mt-16">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-center text-sm text-(--text-tertiary)">
            Made with ❤️ by <a href="https://sinek.dev" target="_blank" rel="noopener noreferrer" className="text-(--primary) hover:opacity-80">sinek.dev</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Home;
