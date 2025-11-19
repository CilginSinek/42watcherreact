import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCache } from '../contexts/useCache';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ThemeToggle } from '../components/ThemeToggle';
import { StudentModal } from '../components/StudentModal';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import mockData from '../mockData.json';

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
  image: { link: string };
  correction_point: number;
  wallet: number;
  projects?: Project[];
  patronage?: Patronage | null;
  project_count?: number;
}

interface DashboardData {
  currentMonth: string;
  topProjectSubmitters: { login: string; projectCount: number; totalScore: number; student: StudentFull | null }[];
  topLocationStats: { login: string; totalDuration: string; student: StudentFull | null }[];
  allTimeProjects: { login: string; projectCount: number; student: StudentFull | null }[];
  allTimeWallet: { login: string; wallet: number; student: StudentFull | null }[];
  allTimePoints: { login: string; correctionPoint: number; student: StudentFull | null }[];
  allTimeLevels: { login: string; level: number; student: StudentFull | null }[];
  gradeDistribution: { name: string; value: number }[];
}

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

function Dashboard() {
  const { user, logout, token } = useAuth();
  const { getDashboardCache, setDashboardCache } = useCache();
  const [campusId, setCampusId] = useState('all');
  const [data, setData] = useState<DashboardData | null>(getDashboardCache(campusId) as DashboardData | null);
  const [loading, setLoading] = useState(!getDashboardCache(campusId));
  const [selectedStudent, setSelectedStudent] = useState<StudentFull | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const dailyOccupancy = [
    { hour: '08:00', occupancy: 25 },
    { hour: '09:00', occupancy: 45 },
    { hour: '10:00', occupancy: 65 },
    { hour: '11:00', occupancy: 72 },
    { hour: '12:00', occupancy: 55 },
    { hour: '13:00', occupancy: 48 },
    { hour: '14:00', occupancy: 68 },
    { hour: '15:00', occupancy: 78 },
    { hour: '16:00', occupancy: 82 },
    { hour: '17:00', occupancy: 75 },
    { hour: '18:00', occupancy: 60 },
    { hour: '19:00', occupancy: 35 }
  ];

  const weeklyOccupancy = [
    { day: 'Mon', occupancy: 72 },
    { day: 'Tue', occupancy: 78 },
    { day: 'Wed', occupancy: 85 },
    { day: 'Thu', occupancy: 82 },
    { day: 'Fri', occupancy: 68 },
    { day: 'Sat', occupancy: 35 },
    { day: 'Sun', occupancy: 20 }
  ];

  const COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const fetchDashboardData = async () => {
    if (isLocalhost) {
      setLoading(true);
      setTimeout(() => {
        setData(mockData.mockDashboard as DashboardData);
        setDashboardCache(campusId, mockData.mockDashboard);
        setLoading(false);
      }, 500);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campusId !== 'all') {
        params.append('campusId', campusId);
      }
      
      const response = await axios.get(`/api/dashboard?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(response.data);
      setDashboardCache(campusId, response.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cachedData = getDashboardCache(campusId);
    if (cachedData) {
      setData(cachedData as DashboardData);
      setLoading(false);
    } else if (token) {
      fetchDashboardData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, campusId]);

  const handleStudentClick = (student: StudentFull | null) => {
    setSelectedStudent(student);
    setIsModalOpen(true);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const StatCard = ({ rank, icon, name, primaryStat, secondaryStat, onClick }: any) => (
    <div
      onClick={onClick}
      className="card-hover group cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-(--primary) text-white font-bold text-sm">
          {rank}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
      {name && <p className="text-(--text-tertiary) text-sm mb-2">{name}</p>}
      <div className="space-y-1">
        {primaryStat && <p className="text-lg font-bold text-(--primary)">{primaryStat}</p>}
        {secondaryStat && <p className="text-sm text-(--text-secondary)">{secondaryStat}</p>}
      </div>
    </div>
  );

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)' }} className="min-h-screen transition-colors duration-300">
      {/* Header */}
      <header style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }} className="border-b backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <Link to="/dashboard" className="text-xl font-bold text-(--text-primary) hover:text-(--primary) transition">
                42 Watcher
              </Link>
              <nav className="flex items-center gap-6 ml-8">
                <Link to="/dashboard" className="text-(--primary) border-b-2 border-(--primary) pb-1">Dashboard</Link>
                <Link to="/students" className="text-(--text-secondary) hover:text-(--text-primary) transition pb-1">Students</Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <select
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
                className="input py-2 text-sm"
              >
                <option value="all">All Campuses</option>
                <option value="50">Kocaeli</option>
                <option value="49">Istanbul</option>
              </select>

              <ThemeToggle />

              {user && (
                <div className="flex items-center gap-3">
                  <img src={user.image.link || "/placeholder.svg"} alt={user.login} className="w-8 h-8 rounded-full object-cover" />
                  <span className="text-(--text-secondary) text-sm">{user.login}</span>
                  <button
                    onClick={logout}
                    className="btn-secondary py-1 px-3 text-sm"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 rounded-full border-2 border-(--primary) border-t-transparent animate-spin mb-3"></div>
            <p className="text-(--text-secondary)">Loading dashboard...</p>
          </div>
        ) : data ? (
          <>
            <h2 className="section-title text-2xl mb-6">📍 Campus Occupancy</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
              <div className="card">
                <h3 className="text-lg font-bold mb-6">Hourly Occupancy</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dailyOccupancy}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="hour" stroke="var(--text-tertiary)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="var(--text-tertiary)" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      labelStyle={{ color: 'var(--text-primary)' }}
                    />
                    <Bar dataKey="occupancy" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <h3 className="text-lg font-bold mb-6">Weekly Average</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={weeklyOccupancy}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" stroke="var(--text-tertiary)" />
                    <YAxis stroke="var(--text-tertiary)" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      labelStyle={{ color: 'var(--text-primary)' }}
                    />
                    <Bar dataKey="occupancy" fill="#06b6d4" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
              <div className="card">
                <h3 className="text-lg font-bold mb-6">Performance Trend</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={[
                    { name: 'Week 1', value: 400 },
                    { name: 'Week 2', value: 450 },
                    { name: 'Week 3', value: 380 },
                    { name: 'Week 4', value: 520 }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--text-tertiary)" />
                    <YAxis stroke="var(--text-tertiary)" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      labelStyle={{ color: 'var(--text-primary)' }}
                    />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <h3 className="text-lg font-bold mb-6">Grade Distribution</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={data.gradeDistribution || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {(data.gradeDistribution || []).map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      labelStyle={{ color: 'var(--text-primary)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Monthly Stats */}
            <h2 className="section-title text-2xl mb-6">📊 {data.currentMonth} Statistics</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
              <section>
                <h3 className="section-title text-lg mb-4">🏆 Top Project Submitters</h3>
                <div className="grid grid-cols-1 gap-3">
                  {data.topProjectSubmitters.slice(0, 3).map((submitter, index) => (
                    <StatCard
                      key={submitter.login}
                      rank={index + 1}
                      icon="📦"
                      name={submitter.student?.displayname || submitter.login}
                      primaryStat={`${submitter.projectCount} projects`}
                      secondaryStat={`${submitter.totalScore} total score`}
                      onClick={() => handleStudentClick(submitter.student)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h3 className="section-title text-lg mb-4">⏱ Top Campus Time</h3>
                <div className="grid grid-cols-1 gap-3">
                  {data.topLocationStats.slice(0, 3).map((location, index) => (
                    <StatCard
                      key={location.login}
                      rank={index + 1}
                      icon="📍"
                      name={location.student?.displayname || location.login}
                      primaryStat={location.totalDuration}
                      onClick={() => handleStudentClick(location.student)}
                    />
                  ))}
                </div>
              </section>
            </div>

            {/* All Time Rankings */}
            <h2 className="section-title text-2xl mb-6">🌟 All Time Rankings</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <section>
                <h3 className="section-title text-base mb-3">📦 Most Projects</h3>
                <div className="grid grid-cols-1 gap-2">
                  {data.allTimeProjects?.slice(0, 3).map((ranking, index) => (
                    <StatCard
                      key={ranking.login}
                      rank={index + 1}
                      icon="📦"
                      primaryStat={`${ranking.projectCount}`}
                      secondaryStat={ranking.student?.displayname || ranking.login}
                      onClick={() => handleStudentClick(ranking.student)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h3 className="section-title text-base mb-3">💰 Richest Wallets</h3>
                <div className="grid grid-cols-1 gap-2">
                  {data.allTimeWallet?.slice(0, 3).map((ranking, index) => (
                    <StatCard
                      key={ranking.login}
                      rank={index + 1}
                      icon="💰"
                      primaryStat={`${ranking.wallet}₳`}
                      secondaryStat={ranking.student?.displayname || ranking.login}
                      onClick={() => handleStudentClick(ranking.student)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h3 className="section-title text-base mb-3">⭐ Evaluation Points</h3>
                <div className="grid grid-cols-1 gap-2">
                  {data.allTimePoints?.slice(0, 3).map((ranking, index) => (
                    <StatCard
                      key={ranking.login}
                      rank={index + 1}
                      icon="⭐"
                      primaryStat={`${ranking.correctionPoint}`}
                      secondaryStat={ranking.student?.displayname || ranking.login}
                      onClick={() => handleStudentClick(ranking.student)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h3 className="section-title text-base mb-3">🎓 Highest Levels</h3>
                <div className="grid grid-cols-1 gap-2">
                  {data.allTimeLevels?.slice(0, 3).map((ranking, index) => (
                    <StatCard
                      key={ranking.login}
                      rank={index + 1}
                      icon="🎓"
                      primaryStat={`${ranking.level?.toFixed(2)}`}
                      secondaryStat={ranking.student?.displayname || ranking.login}
                      onClick={() => handleStudentClick(ranking.student)}
                    />
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-red-400">Failed to load dashboard data</p>
          </div>
        )}
      </main>

      <StudentModal isOpen={isModalOpen} student={selectedStudent as StudentFull} onClose={() => setIsModalOpen(false)} />

      {/* Footer */}
      <footer style={{ borderColor: 'var(--border)' }} className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-(--text-tertiary) text-sm">
          <p>Made with by <a href="https://sinek.dev" target="_blank" rel="noopener noreferrer" className="text-(--primary) hover:opacity-80">sinek.dev</a></p>
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;
