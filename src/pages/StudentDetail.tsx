import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from 'recharts';
import mockData from '../mockData.json';

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
  is_piscine: boolean;
  is_trans: boolean;
  grade: string | null;
  project_count?: number;
  projects?: Array<{ project: string; score: number; date: string; status: string }>;
  patronage?: { godfathers?: Array<{ login: string }>; children?: Array<{ login: string }> };
  feedbackCount?: number;
  avgRating?: number;
  evoPerformance?: number;
  logTimes?: Array<{ date: string; duration: number }>;
  attendanceDays?: Array<{ day: string; avgHours: number }>;
}

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

function StudentDetail() {
  const { login } = useParams<{ login: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly' | 'quarterly'>('weekly');

  useEffect(() => {
    const fetchStudent = async () => {
      setLoading(true);
      setError(null);
      try {
        if (isLocalhost) {
          const foundStudent = mockData.mockStudents.find(s => s.login === login);
          if (foundStudent) {
            setStudent(foundStudent as unknown as Student);
          } else {
            setError('Student not found');
          }
        } else {
          const response = await axios.get(`/api/students/${login}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          
          if (response.data.student) {
            setStudent(response.data.student);
          } else {
            setError('Student not found');
          }
        }
      } catch (err) {
        console.error('Error fetching student:', err);
        setError('Failed to load student details');
      } finally {
        setLoading(false);
      }
    };

    if (login && token) {
      fetchStudent();
    }
  }, [login, token]);

  if (loading) {
    return (
      <div style={{ backgroundColor: 'var(--bg-primary)' }} className="min-h-screen flex items-center justify-center transition-colors duration-300">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-full border-3 border-(--primary) border-t-transparent animate-spin mb-4"></div>
          <p className="text-(--text-secondary)">Loading student profile...</p>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div style={{ backgroundColor: 'var(--bg-primary)' }} className="min-h-screen flex items-center justify-center p-4 transition-colors duration-300">
        <div className="card max-w-md w-full text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-(--text-primary) mb-2">Student Not Found</h2>
          <p className="text-(--text-secondary) mb-6">{error || 'This student could not be loaded'}</p>
          <button
            onClick={() => navigate('/students')}
            className="w-full btn btn-primary"
          >
            Back to Students
          </button>
        </div>
      </div>
    );
  }

  const logTimesWeekly = [
    { date: 'Mon', hours: 8 },
    { date: 'Tue', hours: 9 },
    { date: 'Wed', hours: 7.5 },
    { date: 'Thu', hours: 10 },
    { date: 'Fri', hours: 8.5 },
    { date: 'Sat', hours: 4 },
    { date: 'Sun', hours: 2 }
  ];

  const logTimesMonthly = [
    { week: 'Week 1', hours: 48 },
    { week: 'Week 2', hours: 52 },
    { week: 'Week 3', hours: 45 },
    { week: 'Week 4', hours: 50 }
  ];

  const logTimesQuarterly = [
    { month: 'Jan', hours: 180 },
    { month: 'Feb', hours: 195 },
    { month: 'Mar', hours: 188 }
  ];

  const attendanceByDay = [
    { day: 'Mon', percentage: 95 },
    { day: 'Tue', percentage: 98 },
    { day: 'Wed', percentage: 92 },
    { day: 'Thu', percentage: 96 },
    { day: 'Fri', percentage: 88 },
    { day: 'Sat', percentage: 35 },
    { day: 'Sun', percentage: 15 }
  ];

  const performanceData = [
    { month: 'Jan', performance: 65 },
    { month: 'Feb', performance: 72 },
    { month: 'Mar', performance: 68 },
    { month: 'Apr', performance: 85 }
  ];

  const projectStats = [
    { name: 'Success', value: student.project_count || 0, color: '#10b981' },
    { name: 'In Progress', value: Math.ceil((student.project_count || 0) * 0.3), color: '#f59e0b' },
    { name: 'Failed', value: Math.ceil((student.project_count || 0) * 0.1), color: '#ef4444' }
  ];

  const getLogTimesData = () => {
    switch (activeTab) {
      case 'monthly':
        return logTimesMonthly;
      case 'quarterly':
        return logTimesQuarterly;
      default:
        return logTimesWeekly;
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)' }} className="min-h-screen transition-colors duration-300">
      {/* Header */}
      <header style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }} className="bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/students')}
              className="text-(--text-secondary) hover:text-(--text-primary) flex items-center gap-2 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <Link to="/dashboard" className="text-lg font-bold text-(--text-primary) hover:text-(--primary) transition">
              42 Watcher
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {user && (
              <button
                onClick={() => navigate('/dashboard')}
                className="text-(--text-secondary) hover:text-(--text-primary) transition text-sm"
              >
                Dashboard
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Profile Header Card */}
        <div className="card mb-8">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
            <div className="shrink-0 w-full md:w-auto flex justify-center md:block">
              <img
                src={student.image.versions.large || "/placeholder.svg"}
                alt={student.login}
                className="w-24 h-24 md:w-32 md:h-32 rounded-2xl object-cover shadow-lg"
              />
            </div>
            <div className="flex-1 w-full">
              <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                <div className="w-full">
                  <h1 className="text-2xl md:text-4xl font-bold text-(--text-primary) mb-1">
                    {student.displayname || student.login}
                  </h1>
                  <p className="text-base md:text-lg text-(--text-secondary) mb-4">@{student.login}</p>
                  <a
                    href={`https://profile.intra.42.fr/users/${student.login}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-(--primary) hover:opacity-80 font-medium transition text-sm md:text-base"
                  >
                    View on 42 Intra →
                  </a>
                </div>
                <div className="flex gap-2 flex-wrap justify-start md:justify-end w-full md:w-auto">
                  {student['alumni?'] && <span className="px-3 md:px-4 py-1 md:py-2 bg-green-100 text-green-700 rounded-full text-xs md:text-sm font-semibold">Alumni</span>}
                  {student['active?'] && <span className="px-3 md:px-4 py-1 md:py-2 bg-blue-100 text-blue-700 rounded-full text-xs md:text-sm font-semibold">Active</span>}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mt-6 md:mt-8">
                <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-3 md:p-4 rounded-xl">
                  <p className="text-(--text-tertiary) text-xs md:text-sm font-medium mb-1">Correction Points</p>
                  <p className="text-xl md:text-3xl font-bold text-(--primary)">{student.correction_point}</p>
                </div>
                <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-3 md:p-4 rounded-xl">
                  <p className="text-(--text-tertiary) text-xs md:text-sm font-medium mb-1">Wallet</p>
                  <p className="text-xl md:text-3xl font-bold text-(--primary)">{student.wallet}₳</p>
                </div>
                <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-3 md:p-4 rounded-xl">
                  <p className="text-(--text-tertiary) text-xs md:text-sm font-medium mb-1">Projects</p>
                  <p className="text-xl md:text-3xl font-bold text-(--primary)">{student.project_count || 0}</p>
                </div>
                <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-3 md:p-4 rounded-xl">
                  <p className="text-(--text-tertiary) text-xs md:text-sm font-medium mb-1">Performance</p>
                  <p className="text-xl md:text-3xl font-bold text-(--primary)">{student.evoPerformance || 0}%</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card mb-8">
          <div className="mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <h3 className="text-lg font-bold">📊 Log Times</h3>
              <div className="flex flex-wrap gap-4 md:gap-6">
                <div style={{ backgroundColor: 'var(--bg-input)' }} className="px-4 py-2 rounded-lg">
                  <p className="text-(--text-tertiary) text-xs font-medium mb-1">Total Duration</p>
                  <p className="text-2xl font-bold text-(--primary)">
                    {activeTab === 'weekly' ? '49h' : activeTab === 'monthly' ? '195h' : '563h'}
                  </p>
                </div>
                <div style={{ backgroundColor: 'var(--bg-input)' }} className="px-4 py-2 rounded-lg">
                  <p className="text-(--text-tertiary) text-xs font-medium mb-1">Avg Daily</p>
                  <p className="text-2xl font-bold text-(--primary)">
                    {activeTab === 'weekly' ? '7h' : activeTab === 'monthly' ? '48h' : '187h'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['weekly', 'monthly', 'quarterly'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 md:px-4 py-2 rounded-lg font-medium transition text-sm md:text-base ${
                    activeTab === tab
                      ? 'bg-(--primary) text-white'
                      : 'bg-(--bg-input) text-(--text-secondary) hover:text-(--text-primary)'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={getLogTimesData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey={activeTab === 'weekly' ? 'date' : activeTab === 'monthly' ? 'week' : 'month'} stroke="var(--text-tertiary)" />
              <YAxis stroke="var(--text-tertiary)" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                labelStyle={{ color: 'var(--text-primary)' }}
              />
              <Line type="monotone" dataKey="hours" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card mb-8">
          <h3 className="text-lg font-bold mb-6">📅 Average Attendance by Day</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={attendanceByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" stroke="var(--text-tertiary)" />
              <YAxis stroke="var(--text-tertiary)" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                labelStyle={{ color: 'var(--text-primary)' }}
                formatter={(value) => `${value}%`}
              />
              <Bar dataKey="percentage" fill="#06b6d4" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-8">
          <div className="card">
            <h3 className="text-lg font-bold mb-6">Performance Trend</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--text-tertiary)" />
                <YAxis stroke="var(--text-tertiary)" />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                />
                <Line type="monotone" dataKey="performance" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-6">Project Distribution</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={projectStats}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {projectStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
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

        {/* Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          <div className="lg:col-span-2 space-y-6 md:space-y-8">
            <div className="card">
              <h3 className="text-lg font-bold text-(--text-primary) mb-4">📋 Projects</h3>
              <div className="space-y-3">
                {student.projects && student.projects.length > 0 ? (
                  student.projects.map((project, index) => (
                    <div
                      key={index}
                      className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4 p-3 md:p-4 rounded-lg"
                      style={{ backgroundColor: 'var(--bg-input)' }}
                    >
                      <div className="flex-1 w-full">
                        <p className="font-semibold text-(--text-primary) text-sm md:text-base">{project.project}</p>
                        <p className="text-xs md:text-sm text-(--text-secondary)">{new Date(project.date).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
                        <span className={`px-3 py-1 rounded-full text-xs md:text-sm font-medium whitespace-nowrap ${
                          project.status === 'success' ? 'bg-green-100 text-green-700' :
                          project.status === 'fail' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {project.status.replace('_', ' ')}
                        </span>
                        <span className="text-lg md:text-2xl font-bold text-(--primary) whitespace-nowrap">{project.score}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-(--text-secondary)">No projects yet</p>
                )}
              </div>
            </div>

            {/* Basic Info */}
            <div className="card">
              <h3 className="text-lg font-bold text-(--text-primary) mb-4">Information</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs md:text-sm text-(--text-tertiary) font-medium mb-1">Email</p>
                  <p className="text-(--text-primary) text-sm md:text-base break-all">{student.email}</p>
                </div>
                <div>
                  <p className="text-xs md:text-sm text-(--text-tertiary) font-medium mb-1">Grade</p>
                  <p className="text-(--text-primary) text-sm md:text-base">{student.grade || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs md:text-sm text-(--text-tertiary) font-medium mb-1">Location</p>
                  <p className="text-(--text-primary) text-sm md:text-base">{student.location || 'Offline'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 md:space-y-8">
            {/* Feedback */}
            {student.feedbackCount && student.feedbackCount > 0 && (
              <div className="card">
                <h3 className="text-lg font-bold text-(--text-primary) mb-4">Evaluation</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-(--text-secondary)">Feedbacks</span>
                    <span className="font-bold text-(--text-primary)">{student.feedbackCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-(--text-secondary)">Average Rating</span>
                    <span className="font-bold text-(--primary)">{(student.avgRating ?? 0).toFixed(2)}/5</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderColor: 'var(--border)' }} className="border-t mt-12">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-(--text-tertiary) text-sm">
          <p>Made with by <a href="https://sinek.dev" target="_blank" rel="noopener noreferrer" className="text-(--primary) hover:opacity-80">sinek.dev</a></p>
        </div>
      </footer>
    </div>
  );
}

export default StudentDetail;
