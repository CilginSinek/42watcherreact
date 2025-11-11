import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCache } from '../contexts/useCache';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import './Students.css';

interface Project {
  project: string;
  score: number;
  date: string;
  status: 'success' | 'fail' | 'in_progress';
}

interface Patronage {
  godfathers: { login: string }[];
  children: { login: string }[];
}

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
  grade: string | null;
  'staff?': boolean;
  is_test: boolean;
  projects?: Project[];
  project_count?: number;
  has_cheats?: boolean;
  cheat_count?: number;
  cheatProjects?: Project[];
  patronage?: Patronage | null;
  godfather_count?: number;
  children_count?: number;
  feedbackCount?: number;
  avgRating?: number;
  avgRatingDetails?: {
    nice: number;
    rigorous: number;
    interested: number;
    punctuality: number;
  };
  evoPerformance?: number;
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function Students() {
  const { user, logout, token } = useAuth();
  const { studentsData, setStudentsData } = useCache();
  const [searchParams] = useSearchParams();
  const [students, setStudents] = useState<Student[]>(
    studentsData ? (studentsData as { students: Student[] }).students : []
  );
  const [loading, setLoading] = useState(!studentsData);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState('all');
  const [campusId, setCampusId] = useState('all');
  const [sortBy, setSortBy] = useState('login');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo>(
    studentsData 
      ? (studentsData as { pagination: PaginationInfo }).pagination 
      : { total: 0, page: 1, limit: 50, totalPages: 0 }
  );
  const [isInitialLoad, setIsInitialLoad] = useState(true);

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
      setStudentsData(response.data);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // İlk yüklemede cache varsa fetch yapma
    if (isInitialLoad && studentsData) {
      setIsInitialLoad(false);
      return;
    }
    
    // Token yoksa fetch yapma
    if (!token) return;
    
    // Sadece filter/sort/pagination değişikliklerinde fetch at (search hariç)
    fetchStudents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, sortBy, order, status, campusId, token]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (pagination.page !== 1) {
      setPagination(prev => ({ ...prev, page: 1 }));
    } else {
      fetchStudents();
    }
  };

  const handleFilterChange = (setter: (value: string) => void, value: string) => {
    setter(value);
    if (pagination.page !== 1) {
      setPagination(prev => ({ ...prev, page: 1 }));
    }
  };

  const getStatusBadge = (student: Student) => {
    if (student['staff?']) return <span className="badge staff">👨‍💼 Staff</span>;
    if (student.is_test) return <span className="badge test">🧪 Test Account</span>;
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
    // Projects and patronage are already included in student data from API
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
            <h1><a href="/dashboard" className="header-link">42 Watcher</a></h1>
            <nav className="nav-links">
              <Link to="/dashboard" className="nav-link">Dashboard</Link>
              <Link to="/students" className="nav-link active">Students</Link>
            </nav>
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
          <div className="search-row">
            <div className="search-input-wrapper">
              <input
                type="text"
                placeholder="Search by login, name, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
              {search && (
                <button 
                  type="button" 
                  onClick={() => setSearch('')}
                  className="clear-btn"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <button type="submit" className="search-btn">🔍 Search</button>
          </div>
          
          <div className="filter-controls">
            <select value={campusId} onChange={(e) => handleFilterChange(setCampusId, e.target.value)} className="filter-select">
              <option value="all">All Campuses</option>
              <option value="49">Istanbul</option>
              <option value="50">Kocaeli</option>
            </select>

            <select value={status} onChange={(e) => handleFilterChange(setStatus, e.target.value)} className="filter-select">
              <option value="all">All Students</option>
              <option value="active">Active</option>
              <option value="blackhole">Blackhole</option>
              <option value="piscine">Piscine</option>
              <option value="transfer">Transcender</option>
              <option value="alumni">Alumni</option>
              <option value="sinker">Sinker</option>
              <option value="freeze">Freeze</option>
              <option value="cheaters">Cheaters</option>
              <option value="staff">Staff</option>
              <option value="test">Test Accounts</option>
            </select>

            <select value={sortBy} onChange={(e) => handleFilterChange(setSortBy, e.target.value)} className="filter-select">
              <option value="login">Login</option>
              <option value="correction_point">Correction Points</option>
              <option value="wallet">Wallet</option>
              <option value="created_at">Created Date</option>
              <option value="cheat_count">Cheat Count</option>
              <option value="project_count">Project Count</option>
              <option value="log_time">Log Time</option>
              <option value="godfather_count">Godfather Count</option>
              <option value="children_count">Children Count</option>
              <option value="evo_performance">Evo Performance</option>
              <option value="feedback_count">Feedback Count</option>
              <option value="avg_rating">Average Rating</option>
            </select>

            <button 
              onClick={() => {
                setOrder(order === 'asc' ? 'desc' : 'asc');
                if (pagination.page !== 1) {
                  setPagination(prev => ({ ...prev, page: 1 }));
                }
              }}
              className="order-btn"
              type="button"
            >
              {order === 'asc' ? '↑ Ascending' : '↓ Descending'}
            </button>
          </div>
        </form>

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
                  {student.has_cheats && student.cheat_count && student.cheat_count > 0 && (
                    <span className="badge cheater">🚨 {student.cheat_count}</span>
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
                    {student.project_count && student.project_count > 0 && (
                      <span className="project-count">📦 {student.project_count}</span>
                    )}
                    {student.has_cheats && student.cheat_count && student.cheat_count > 0 && (
                      <span className="cheat-count">🚨 {student.cheat_count}</span>
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

            {/* Evaluation Performance Section */}
            {selectedStudent.feedbackCount !== undefined && selectedStudent.feedbackCount > 0 && (
              <div className="patronage-section">
                <h3 style={{ color: '#10b981', marginBottom: '1rem' }}>
                  ⭐ Evaluation Performance
                </h3>
                <div className="patronage-grid-two">
                  <div className="patronage-box">
                    <h4>📊 Overall Stats</h4>
                    <div className="stat-list">
                      <div className="stat-item">
                        <span className="stat-label">Total Feedbacks:</span>
                        <span className="stat-value">{selectedStudent.feedbackCount}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Average Rating:</span>
                        <span className="stat-value">{(selectedStudent.avgRating ?? 0).toFixed(2)} / 5.00</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Evo Performance:</span>
                        <span className="stat-value">{(selectedStudent.evoPerformance ?? 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="patronage-box">
                    <h4>⭐ Rating Details</h4>
                    <div className="stat-list">
                      <div className="stat-item">
                        <span className="stat-label">😊 Nice:</span>
                        <span className="stat-value">{(selectedStudent.avgRatingDetails?.nice ?? 0).toFixed(2)} / 4</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">🎯 Rigorous:</span>
                        <span className="stat-value">{(selectedStudent.avgRatingDetails?.rigorous ?? 0).toFixed(2)} / 4</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">🤔 Interested:</span>
                        <span className="stat-value">{(selectedStudent.avgRatingDetails?.interested ?? 0).toFixed(2)} / 4</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">⏰ Punctuality:</span>
                        <span className="stat-value">{(selectedStudent.avgRatingDetails?.punctuality ?? 0).toFixed(2)} / 4</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Patronage Section */}
            {selectedStudent.patronage && (
              <div className="patronage-section">
                <h3 style={{ color: '#667eea', marginBottom: '1rem' }}>
                  👥 Patronage
                </h3>
                <div className="patronage-grid-two">
                  <div className="patronage-box">
                    <h4>🎓 Godfathers ({selectedStudent.patronage.godfathers?.length || 0})</h4>
                    <div className="login-list">
                      {selectedStudent.patronage.godfathers && selectedStudent.patronage.godfathers.length > 0 ? (
                        selectedStudent.patronage.godfathers.map((gf, idx) => (
                          <a
                            key={idx}
                            href={`https://profile.intra.42.fr/users/${gf.login}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="login-badge"
                          >
                            @{gf.login}
                          </a>
                        ))
                      ) : (
                        <span className="no-data">No godfathers</span>
                      )}
                    </div>
                  </div>
                  <div className="patronage-box">
                    <h4>👶 Children ({selectedStudent.patronage.children?.length || 0})</h4>
                    <div className="login-list">
                      {selectedStudent.patronage.children && selectedStudent.patronage.children.length > 0 ? (
                        selectedStudent.patronage.children.map((child, idx) => (
                          <a
                            key={idx}
                            href={`https://profile.intra.42.fr/users/${child.login}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="login-badge"
                          >
                            @{child.login}
                          </a>
                        ))
                      ) : (
                        <span className="no-data">No children</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Projects Section */}
            {selectedStudent.projects === undefined ? (
              <div className="loading">Loading projects...</div>
            ) : selectedStudent.projects.length === 0 ? (
              <div className="no-projects">
                No projects found
              </div>
            ) : (
              <div className="project-sections">
                {/* Cheating Records */}
                {selectedStudent.has_cheats && selectedStudent.cheatProjects && selectedStudent.cheatProjects.length > 0 && (
                  <div className="cheat-list">
                    <h3 style={{ color: '#ef4444', marginBottom: '1rem' }}>
                      ⚠️ Cheating Records ({selectedStudent.cheatProjects.length})
                    </h3>
                    {selectedStudent.cheatProjects.map((cheat, index) => (
                        <div key={index} className="cheat-item">
                          <h4>{cheat.project}</h4>
                          <p><strong>Score:</strong> {cheat.score}</p>
                          <p><strong>Status:</strong> {cheat.status}</p>
                          <p><strong>Date:</strong> {new Date(cheat.date).toLocaleDateString()}</p>
                        </div>
                      ))}
                  </div>
                )}

                {/* Regular Projects - Sadece başarılı olanlar */}
                {selectedStudent.projects.filter((p) => p.status === 'success').length > 0 && (
                  <div className="project-list">
                    <h3 style={{ color: '#667eea', marginBottom: '1rem' }}>
                      📦 Completed Projects ({selectedStudent.projects.filter((p) => p.status === 'success').length})
                    </h3>
                    <div className="project-grid">
                      {selectedStudent.projects
                        .filter((p) => p.status === 'success')
                        .slice(0, 10)
                        .map((project, index) => (
                          <div key={index} className={`project-item status-${project.status}`}>
                            <h4>{project.project}</h4>
                            <div className="project-details">
                              <span className={`score ${
                                project.status === 'success' 
                                  ? 'high' 
                                  : project.status === 'fail' 
                                    ? 'low' 
                                    : 'mid'
                              }`}>
                                ⭐ {project.score}
                              </span>
                              <span className="date">
                                📅 {new Date(project.date).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
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

export default Students;
