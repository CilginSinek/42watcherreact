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
  const { user, logout } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
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
        ...(status !== 'all' && { status })
      });

      const response = await axios.get(`/api/students?${params}`);
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
  }, [pagination.page, sortBy, order, status]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchStudents();
  };

  const getStatusBadge = (student: Student) => {
    if (student.blackholed) return <span className="badge blackhole">⚫ Blackhole</span>;
    if (student.is_piscine) return <span className="badge piscine">🏊 Piscine</span>;
    if (student.is_trans) return <span className="badge transfer">🔄 Transcender</span>;
    if (student['alumni?']) return <span className="badge alumni">🎓 Alumni</span>;
    if (student['active?']) return <span className="badge active">✅ Active</span>;
    return <span className="badge inactive">❌ Inactive</span>;
  };

  const handleStudentClick = async (student: Student) => {
    setSelectedStudent(student);
    setShowModal(true);
    
    // Fetch cheats for this student
    try {
      const response = await axios.get(`/api/cheats?login=${student.login}`);
      setSelectedStudent({ ...student, cheats: response.data.cheats });
    } catch (error) {
      console.error('Error fetching cheats:', error);
      setSelectedStudent({ ...student, cheats: [] });
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedStudent(null);
  };

  return (
    <div className="home-container">
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
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="filter-select">
            <option value="all">All Students</option>
            <option value="active">Active</option>
            <option value="blackhole">Blackhole</option>
            <option value="piscine">Piscine</option>
            <option value="transfer">Transcender</option>
            <option value="alumni">Alumni</option>
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="filter-select">
            <option value="login">Login</option>
            <option value="correction_point">Correction Points</option>
            <option value="wallet">Wallet</option>
            <option value="created_at">Created Date</option>
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
                <img src={student.image.versions.medium} alt={student.login} className="student-avatar" />
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
              <button className="close-btn" onClick={closeModal}>×</button>
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
  );
}

export default Home;
