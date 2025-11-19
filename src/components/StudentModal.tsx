import { useNavigate } from 'react-router-dom';

interface StudentModalProps {
  isOpen: boolean;
  student: {
    login: string;
    displayname: string;
    image: { link: string };
    correction_point: number;
    wallet: number;
    project_count?: number;
    monthlyLogTimes?: Array<{ date: string; login_at: string; logout_at: string; duration: string }>;
  };
  onClose: () => void;
}

export function StudentModal({ isOpen, student, onClose }: StudentModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleViewProfile = () => {
    navigate(`/students/${student.login}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="card max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4 sticky top-0 bg-inherit pb-4">
          <h2 className="text-xl font-bold text-(--text-primary)">Student Profile</h2>
          <button
            onClick={onClose}
            className="text-(--text-tertiary) hover:text-(--text-primary) transition text-2xl leading-none shrink-0"
          >
            ×
          </button>
        </div>

        {/* Student Info */}
        <div className="flex gap-4 mb-6 flex-col sm:flex-row">
          <img
            src={student.image.link || "/placeholder.svg"}
            alt={student.login}
            className="w-16 h-16 rounded-lg object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <a
              href={`https://profile.intra.42.fr/users/${student.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-bold text-(--primary) hover:opacity-80 transition block truncate"
            >
              {student.displayname}
            </a>
            <p className="text-(--text-secondary) text-sm truncate">@{student.login}</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-3 rounded-lg">
            <p className="text-(--text-tertiary) text-xs font-medium mb-1">Points</p>
            <p className="text-lg font-bold text-(--primary)">{student.correction_point}</p>
          </div>
          <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-3 rounded-lg">
            <p className="text-(--text-tertiary) text-xs font-medium mb-1">Wallet</p>
            <p className="text-lg font-bold text-(--primary)">{student.wallet}₳</p>
          </div>
          <div style={{ backgroundColor: 'var(--bg-input)' }} className="p-3 rounded-lg">
            <p className="text-(--text-tertiary) text-xs font-medium mb-1">Projects</p>
            <p className="text-lg font-bold text-(--primary)">{student.project_count || 0}</p>
          </div>
        </div>

        {student.monthlyLogTimes && student.monthlyLogTimes.length > 0 && (
          <div className="mb-6">
            <h3 className="text-(--text-primary) font-semibold mb-3">Monthly Log Times</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {student.monthlyLogTimes.map((log, idx) => (
                <div key={idx} style={{ backgroundColor: 'var(--bg-input)' }} className="p-3 rounded-lg flex justify-between items-center text-sm">
                  <span className="text-(--text-secondary)">{new Date(log.date).toLocaleDateString()}</span>
                  <div className="text-(--text-primary) font-medium text-right">
                    <div>{log.login_at} - {log.logout_at}</div>
                    <div className="text-(--text-tertiary) text-xs">Duration: {log.duration}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 flex-col sm:flex-row">
          <button
            onClick={handleViewProfile}
            className="flex-1 btn btn-primary py-2"
          >
            View Full Profile
          </button>
          <button
            onClick={onClose}
            className="flex-1 btn btn-secondary py-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
