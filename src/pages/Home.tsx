import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import './Home.css';

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
  next_milestone: string | null;
  'active?': boolean;
  'alumni?': boolean;
  is_piscine: boolean;
  is_trans: boolean;
  freeze: boolean | null;
  sinker: boolean | null;
  cheats?: Cheat[];
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
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [campusId, setCampusId] = useState('all');
  const [sortBy, setSortBy] = useState('login');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0
  });

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        order,
        ...(search && { search }),
        ...(status !== 'all' && { status }),
        ...(campusId !== 'all' && { campusId })
      });

      const response = await axios.get(`/api/students?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
  }, [pagination.page, sortBy, order, status, campusId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchStudents();
  };

  const getStatusBadge = (student: Student) => {
    if (student.blackholed) return <span className="badge blackhole">⚫ Blackhole</span>;
    if (student.is_piscine) return <span className="badge piscine">🏊 Piscine</span>;
    if (student.sinker) return <span className="badge sinker">⚓ Sinker</span>;
    if (student.freeze) return <span className="badge freeze">❄️ Freeze</span>;
    if (student.is_trans) return <span className="badge transfer">🔄 Transcender</span>;
    if (student['alumni?']) return <span className="badge alumni">🎓 Alumni</span>;
    if (student['active?']) return <span className="badge active">✅ Active</span>;
    return <span className="badge inactive">❌ Inactive</span>;
  };

  const handleStudentClick = (student: Student) => {
    // Cheats are already included in student data from API
    setSelectedStudent(student);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedStudent(null);
  };

  return (
    <div className="home-container">
      <div className="home-content">
        <header className="home-header">
          <div className="header-content">
            <h1>42 Watcher</h1>
            {user && (
              <div className="user-info">
                <img src={user.image.link} alt={user.login} />
                <span>{user.login}</span>
                <button onClick={logout} className="logout-btn">Logout</button>
              </div>
            )}
          </div>
        </header>

      <div className="filters-section">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search by login, name, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <button type="submit" className="search-btn">🔍 Search</button>
        </form>

        <div className="filter-controls">
          <select value={campusId} onChange={(e) => setCampusId(e.target.value)} className="filter-select">
            <option value="all">All Campuses</option>
            <option value="49">Istanbul</option>
            <option value="50">Kocaeli</option>
          </select>

          <select value={status} onChange={(e) => setStatus(e.target.value)} className="filter-select">
            <option value="all">All Students</option>
            <option value="active">Active</option>
            <option value="blackhole">Blackhole</option>
            <option value="piscine">Piscine</option>
            <option value="transfer">Transcender</option>
            <option value="alumni">Alumni</option>
            <option value="sinker">Sinker</option>
            <option value="freeze">Freeze</option>
            <option value="cheaters">Cheaters</option>
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="filter-select">
            <option value="login">Login</option>
            <option value="correction_point">Correction Points</option>
            <option value="wallet">Wallet</option>
            <option value="created_at">Created Date</option>
            <option value="cheat_count">Cheat Count</option>
          </select>

          <button 
            onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
            className="order-btn"
          >
            {order === 'asc' ? '↑ Ascending' : '↓ Descending'}
          </button>
        </div>

        <div className="stats">
          <span>Total: {pagination.total} students</span>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading students...</div>
      ) : (
        <>
          <div className="students-grid">
            {students.map((student) => (
              <div 
                key={student.id} 
                className="student-card"
                onClick={() => handleStudentClick(student)}
              >
                <div className="student-card-header">
                  <img src={student.image.versions.medium} alt={student.login} className="student-avatar" />
                  {student.cheats && student.cheats.length > 0 && (
                    <span className="badge cheater">🚨 {student.cheats.length}</span>
                  )}
                </div>
                <div className="student-info">
                  <h3>
                    <a 
                      href={`https://profile.intra.42.fr/users/${student.login}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {student.displayname || student.login}
                    </a>
                  </h3>
                  <p className="login">@{student.login}</p>
                  {getStatusBadge(student)}
                  <div className="student-stats">
                    <span>⭐ {student.correction_point}</span>
                    <span>💰 {student.wallet}₳</span>
                    {student.cheats && student.cheats.length > 0 && (
                      <span className="cheat-count">🚨 {student.cheats.length}</span>
                    )}
                    {student.next_milestone && (
                      <span>🎯 {student.next_milestone}</span>
                    )}
                  </div>
                  {student.location && (
                    <p className="location">📍 {student.location}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {students.length === 0 && !loading && (
            <div className="no-results">
              <div className="no-results-icon">🔍</div>
              <div className="no-results-text">Sonuç Bulunamadı</div>
              <div className="no-results-subtext">
                Arama kriterlerinize uygun öğrenci bulunamadı. Lütfen filtreleri değiştirip tekrar deneyin.
              </div>
            </div>
          )}

          {students.length > 0 && (
            <div className="pagination">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="pagination-btn"
              >
                ← Previous
              </button>
              <span className="page-info">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="pagination-btn"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {showModal && selectedStudent && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <a 
                  href={`https://profile.intra.42.fr/users/${selectedStudent.login}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#667eea', textDecoration: 'none' }}
                >
                  {selectedStudent.displayname || selectedStudent.login}
                </a>
              </h2>
              <button className="close-btn" onClick={closeModal} aria-label="Close modal"></button>
            </div>

            {selectedStudent.cheats === undefined ? (
              <div className="loading">Loading cheats...</div>
            ) : selectedStudent.cheats.length === 0 ? (
              <div className="no-cheats">
                No cheating records found
              </div>
            ) : (
              <div className="cheat-list">
                <h3 style={{ color: '#ef4444', marginBottom: '1rem' }}>
                  ⚠️ Cheating Records ({selectedStudent.cheats.length})
                </h3>
                {selectedStudent.cheats.map((cheat, index) => (
                  <div key={index} className="cheat-item">
                    <h4>{cheat.project}</h4>
                    <p><strong>Score:</strong> {cheat.score}</p>
                    <p><strong>Date:</strong> {new Date(cheat.date).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      <footer className="footer">
        <div className="footer-content">
          <p>Made with ❤️ by <a href="https://sinek.dev" target="_blank" rel="noopener noreferrer">sinek.dev</a></p>
          <div className="footer-links">
            <a href="https://github.com/cilginsinek/42watcherreact" target="_blank" rel="noopener noreferrer" className="github-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Repository
            </a>
            <a href="https://github.com/cilginsinek" target="_blank" rel="noopener noreferrer" className="github-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Home;
