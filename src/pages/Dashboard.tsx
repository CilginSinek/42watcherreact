import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Dashboard.css';

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

interface StudentFull {
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
  grade: string | null;
  projects?: Project[];
  project_count?: number;
  has_cheats?: boolean;
  cheat_count?: number;
  patronage?: Patronage | null;
}

interface Student {
  login: string;
  displayname: string;
  image: {
    link: string;
  };
  correction_point: number;
  wallet: number;
  grade: string | null;
}

interface TopSubmitter {
  login: string;
  projectCount: number;
  totalScore: number;
  projects: Project[];
  student: Student | null;
}

interface TopLocation {
  login: string;
  totalDuration: string;
  student: Student | null;
}

interface AllTimeProject {
  login: string;
  projectCount: number;
  totalScore: number;
  student: Student | null;
}

interface AllTimeWallet {
  login: string;
  wallet: number;
  student: Student | null;
}

interface AllTimePoint {
  login: string;
  correctionPoint: number;
  student: Student | null;
}

interface DashboardData {
  currentMonth: string;
  topProjectSubmitters: TopSubmitter[];
  topLocationStats: TopLocation[];
  allTimeProjects: AllTimeProject[];
  allTimeWallet: AllTimeWallet[];
  allTimePoints: AllTimePoint[];
}

function Dashboard() {
  const { user, logout, token } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<StudentFull | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loadingStudent, setLoadingStudent] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/dashboard', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setData(response.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDashboardData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchStudentDetails = async (login: string) => {
    setLoadingStudent(true);
    try {
      const response = await axios.get(`/api/students?search=${login}&limit=1`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.data.students && response.data.students.length > 0) {
        setSelectedStudent(response.data.students[0]);
        setShowModal(true);
      }
    } catch (error) {
      console.error('Error fetching student details:', error);
    } finally {
      setLoadingStudent(false);
    }
  };

  const handleCardClick = (login: string) => {
    fetchStudentDetails(login);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedStudent(null);
  };

  const formatDuration = (duration: string) => {
    // duration format: "HH:MM:SS"
    const [hours, minutes] = duration.split(':');
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <h1><a href="/dashboard" className="header-link">42 Watcher</a></h1>
          <nav className="nav-links">
            <Link to="/dashboard" className="nav-link active">Dashboard</Link>
            <Link to="/students" className="nav-link">Students</Link>
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

      <div className="dashboard-content">
        {loading ? (
          <div className="loading">Loading dashboard...</div>
        ) : data ? (
          <>
            <h2 className="month-title">📊 {data.currentMonth} Statistics</h2>
            
            <div className="stats-grid">
              {/* Top Project Submitters - This Month */}
              <section className="stats-section">
                <h3 className="section-title">🏆 Top Project Submitters (This Month)</h3>
                <div className="top-list">
                  {data.topProjectSubmitters.map((submitter, index) => (
                    <div 
                      key={submitter.login} 
                      className={`top-card rank-${index + 1}`}
                      onClick={() => handleCardClick(submitter.login)}
                    >
                      <div className="rank-badge">{index + 1}</div>
                      {submitter.student && (
                        <img 
                          src={submitter.student.image.link} 
                          alt={submitter.student.login}
                          className="student-avatar"
                        />
                      )}
                      <div className="student-details">
                        <h4>{submitter.student?.displayname || submitter.login}</h4>
                        <div className="student-stats">
                          <span className="stat-item">
                            📦 {submitter.projectCount} projects
                          </span>
                          <span className="stat-item">
                            ⭐ {submitter.totalScore} total score
                          </span>
                        </div>
                        {submitter.student && (
                          <div className="student-extras">
                            {submitter.student.grade && (
                              <span className="grade-badge">{submitter.student.grade}</span>
                            )}
                            <span className="points">🎯 {submitter.student.correction_point}</span>
                            <span className="wallet">💰 {submitter.student.wallet}₳</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Top Location Stats - Last 3 Months */}
              <section className="stats-section">
                <h3 className="section-title">⏱️ Top Campus Time (Last 3 Months)</h3>
                <div className="top-list">
                  {data.topLocationStats.map((location, index) => (
                    <div 
                      key={location.login} 
                      className={`top-card rank-${index + 1}`}
                      onClick={() => handleCardClick(location.login)}
                    >
                      <div className="rank-badge">{index + 1}</div>
                      {location.student && (
                        <img 
                          src={location.student.image.link} 
                          alt={location.student.login}
                          className="student-avatar"
                        />
                      )}
                      <div className="student-details">
                        <h4>{location.student?.displayname || location.login}</h4>
                        <div className="student-stats">
                          <span className="stat-item time-stat">
                            ⏰ {formatDuration(location.totalDuration)}
                          </span>
                        </div>
                        {location.student && (
                          <div className="student-extras">
                            {location.student.grade && (
                              <span className="grade-badge">{location.student.grade}</span>
                            )}
                            <span className="points">🎯 {location.student.correction_point}</span>
                            <span className="wallet">💰 {location.student.wallet}₳</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* All Time Rankings */}
            <h2 className="month-title">🌟 All Time Rankings</h2>
            <div className="stats-grid stats-grid-three">
              {/* All Time Projects */}
              <section className="stats-section">
                <h3 className="section-title">📦 Most Projects</h3>
                <div className="top-list">
                  {data.allTimeProjects?.map((ranking, index) => (
                    <div 
                      key={ranking.login} 
                      className={`top-card rank-${index + 1}`}
                      onClick={() => handleCardClick(ranking.login)}
                    >
                      <div className="rank-badge">{index + 1}</div>
                      {ranking.student && (
                        <img 
                          src={ranking.student.image.link} 
                          alt={ranking.student.login}
                          className="student-avatar"
                        />
                      )}
                      <div className="student-details">
                        <h4>{ranking.student?.displayname || ranking.login}</h4>
                        <div className="student-stats">
                          <span className="stat-item">📦 {ranking.projectCount} projects</span>
                          <span className="stat-item">⭐ {ranking.totalScore} total score</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* All Time Wallet */}
              <section className="stats-section">
                <h3 className="section-title">💰 Richest Wallets</h3>
                <div className="top-list">
                  {data.allTimeWallet?.map((ranking, index) => (
                    <div 
                      key={ranking.login} 
                      className={`top-card rank-${index + 1}`}
                      onClick={() => handleCardClick(ranking.login)}
                    >
                      <div className="rank-badge">{index + 1}</div>
                      {ranking.student && (
                        <img 
                          src={ranking.student.image.link} 
                          alt={ranking.student.login}
                          className="student-avatar"
                        />
                      )}
                      <div className="student-details">
                        <h4>{ranking.student?.displayname || ranking.login}</h4>
                        <div className="student-stats">
                          <span className="stat-item">💰 {ranking.wallet}₳</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* All Time Points */}
              <section className="stats-section">
                <h3 className="section-title">⭐ Most Evaluation Points</h3>
                <div className="top-list">
                  {data.allTimePoints?.map((ranking, index) => (
                    <div 
                      key={ranking.login} 
                      className={`top-card rank-${index + 1}`}
                      onClick={() => handleCardClick(ranking.login)}
                    >
                      <div className="rank-badge">{index + 1}</div>
                      {ranking.student && (
                        <img 
                          src={ranking.student.image.link} 
                          alt={ranking.student.login}
                          className="student-avatar"
                        />
                      )}
                      <div className="student-details">
                        <h4>{ranking.student?.displayname || ranking.login}</h4>
                        <div className="student-stats">
                          <span className="stat-item">🎯 {ranking.correctionPoint} points</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="error">Failed to load dashboard data</div>
        )}
      </div>

      {/* Modal */}
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
            {loadingStudent ? (
              <div className="loading">Loading...</div>
            ) : selectedStudent.projects && selectedStudent.projects.length > 0 ? (
              <div className="project-sections">
                {/* Cheating Records */}
                {selectedStudent.has_cheats && selectedStudent.cheat_count && selectedStudent.cheat_count > 0 && (
                  <div className="cheat-list">
                    <h3 style={{ color: '#ef4444', marginBottom: '1rem' }}>
                      ⚠️ Cheating Records ({selectedStudent.cheat_count})
                    </h3>
                    {selectedStudent.projects
                      .filter((p) => p.score === -42 && p.status === 'fail')
                      .map((cheat, index) => (
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
                              <span className={`score ${project.score >= 80 ? 'high' : project.score >= 50 ? 'mid' : 'low'}`}>
                                ⭐ {project.score}
                              </span>
                              <span className="date">
                                📅 {new Date(project.date).toLocaleDateString()}
                              </span>
                              <span className={`status-badge status-${project.status}`}>
                                {project.status}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-projects">No projects found</div>
            )}
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="footer-content">
          <a href="https://sinek.dev" target="_blank" rel="noopener noreferrer">sinek.dev</a>
          <span>•</span>
          <a href="https://github.com/CilginSinek" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span>•</span>
          <a href="https://github.com/CilginSinek/42watcherreact" target="_blank" rel="noopener noreferrer">Repository</a>
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;
