'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from 'recharts';

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
  has_cheats?: boolean;
  cheat_count?: number;
  projects?: Array<{ project: string; score: number; date: string; status: string }>;
  patronage?: { godfathers?: Array<{ login: string }>; children?: Array<{ login: string }> };
  feedbackCount?: number;
  avgRating?: number;
  evoPerformance?: number;
  logTimes?: Array<{ date: string; duration: number }>;
  attendanceDays?: Array<{ day: string; avgHours: number }>;
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const currentYear = now.getFullYear();
  const dateYear = date.getFullYear();
  
  const options: Intl.DateTimeFormatOptions = 
    currentYear === dateYear 
      ? { month: 'short', day: 'numeric' }
      : { year: 'numeric', month: 'short', day: 'numeric' };
  
  return date.toLocaleDateString('en-US', options);
};

export default function StudentDetail() {
  const params = useParams();
  const login = params.login as string;
  const router = useRouter();
  const { user, logout, token } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStudent = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/students/${login}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        const data = await response.json();
        
        if (response.ok && data.student) {
          setStudent(data.student);
        } else {
          setError('Student not found');
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
            onClick={() => router.push('/students')}
            className="w-full btn btn-primary"
          >
            Back to Students
          </button>
        </div>
      </div>
    );
  }

  const successCount = student.projects?.filter(p => p.status === 'success').length || 0;
  const failCount = student.projects?.filter(p => p.status === 'fail').length || 0;
  const inProgressCount = student.projects?.filter(p => p.status === 'in_progress').length || 0;

  const projectStats = [
    { name: 'Success', value: successCount, color: '#10b981' },
    { name: 'In Progress', value: inProgressCount, color: '#f59e0b' },
    { name: 'Failed', value: failCount, color: '#ef4444' }
  ].filter(stat => stat.value > 0);

  const attendanceByDay = student.attendanceDays?.map(item => ({
    day: item.day,
    percentage: Math.min(100, Math.round((item.avgHours / 12) * 100))
  })) || [];

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)' }} className="min-h-screen transition-colors duration-300">
      {/* Header */}
      <header style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }} className="border-b backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-xl font-bold text-(--text-primary) hover:text-(--primary) transition">
                42 Watcher
              </Link>
              <nav className="flex items-center gap-6 ml-8">
                <Link href="/dashboard" className="text-(--text-secondary) hover:text-(--text-primary) transition pb-1">Dashboard</Link>
                <Link href="/students" className="text-(--text-secondary) hover:text-(--text-primary) transition pb-1">Students</Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <ThemeToggle />
              {user && (
                <div className="flex items-center gap-3">
                  <img src={user.image.link || "/placeholder.svg"} alt={user.login} className="w-8 h-8 rounded-full object-cover" />
                  <span className="text-(--text-secondary) text-sm">{user.login}</span>
                  <button onClick={logout} className="btn-secondary py-1 px-3 text-sm">
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
        {/* Profile Header */}
        <div className="card mb-8">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <img
              src={student.image.versions?.large || student.image.link || "/placeholder.svg"}
              alt={student.login}
              className="w-32 h-32 rounded-xl object-cover shadow-lg"
            />
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-(--text-primary) mb-2">{student.displayname}</h1>
              <a
                href={`https://profile.intra.42.fr/users/${student.login}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--text-secondary) hover:text-(--primary) transition"
              >
                @{student.login}
              </a>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-4 rounded-lg">
                  <p className="text-(--text-tertiary) text-sm">Correction Points</p>
                  <p className="text-2xl font-bold text-(--primary)">{student.correction_point}</p>
                </div>
                <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-4 rounded-lg">
                  <p className="text-(--text-tertiary) text-sm">Wallet</p>
                  <p className="text-2xl font-bold text-(--primary)">{student.wallet}₳</p>
                </div>
                <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-4 rounded-lg">
                  <p className="text-(--text-tertiary) text-sm">Projects</p>
                  <p className="text-2xl font-bold text-(--primary)">{student.project_count || 0}</p>
                </div>
                <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-4 rounded-lg">
                  <p className="text-(--text-tertiary) text-sm">Grade</p>
                  <p className="text-2xl font-bold text-(--primary)">{student.grade || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Project Stats */}
          {projectStats.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-bold mb-6">Project Statistics</h3>
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
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Attendance by Day */}
          {attendanceByDay.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-bold mb-6">Weekly Attendance</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={attendanceByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" stroke="var(--text-tertiary)" />
                  <YAxis stroke="var(--text-tertiary)" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                  />
                  <Bar dataKey="percentage" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Projects List */}
        {student.projects && student.projects.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-bold mb-6">Recent Projects</h3>
            <div className="space-y-3">
              {student.projects.slice(0, 10).map((project, idx) => (
                <div key={idx} style={{ backgroundColor: 'var(--bg-input)' }} className="p-4 rounded-lg flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-(--text-primary)">{project.project}</p>
                    <p className="text-sm text-(--text-tertiary)">{formatDate(project.date)}</p>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${project.score >= 80 ? 'text-green-500' : project.score >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
                      {project.score}%
                    </div>
                    <div className="text-xs text-(--text-tertiary)">{project.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderColor: 'var(--border)' }} className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-(--text-tertiary) text-sm">
          <p>Made with by <a href="https://sinek.dev" target="_blank" rel="noopener noreferrer" className="text-(--primary) hover:opacity-80">sinek.dev</a></p>
        </div>
      </footer>
    </div>
  );
}
