import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { domToPng } from 'modern-screenshot';

// Types
interface WrappedData {
    summary: {
        headline: string;
        shortDescription: string;
    };
    highlights: {
        mostAttemptedProject?: { name: string; attempts: number; retries: number };
        mostReviewedProject?: { name: string; count: number };
        mostEvaluatedUser?: {
            login: string;
            totalCount: number;
            reviewCount: number;
            feedbackCount: number;
            image?: { link: string; versions: { small: string; medium: string; large: string } };
        };
        mostEvaluatorUser?: {
            login: string;
            totalCount: number;
            reviewCount: number;
            feedbackCount: number;
            image?: { link: string; versions: { small: string; medium: string; large: string } };
        };
        mostUsedWords?: Array<{ word: string; count: number }>;
        mostActiveWeek?: { week: string; total: number; projects: number; reviews: number; feedbacks: number };
        quietestPeriod?: { days: number; startDate: string };
    };
    stats: {
        totalProjects: number;
        totalReviews: number;
        totalFeedbacks: number;
        passedProjects: number;
        avgProjectScore: number;
        godfathers?: number;
        children?: number;
    };
    labels: string[];
    fallbackNotes: string[];
    user?: {
        login: string;
        displayname: string;
        image?: {
            link: string;
            versions: {
                large: string;
                medium: string;
                small: string;
                micro: string;
            };
        };
    };
    watcherUser?: {
        login: string;
        displayname: string;
        image?: {
            link: string;
            versions: {
                large: string;
                medium: string;
                small: string;
                micro: string;
            };
        };
    };
}

// Animated Counter Component
const AnimatedCounter = ({ end, duration = 2000, suffix = '' }: { end: number; duration?: number; suffix?: string }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTime: number;
        const animate = (currentTime: number) => {
            if (!startTime) startTime = currentTime;
            const progress = Math.min((currentTime - startTime) / duration, 1);
            setCount(Math.floor(progress * end));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [end, duration]);

    return <span>{count}{suffix}</span>;
};

// Slide Components
const IntroSlide = ({ displayname, isOwn }: { displayname: string; isOwn: boolean }) => (
    <div className="slide-content flex flex-col items-center justify-center text-center">
        <div className="text-6xl mb-6 animate-bounce">🎉</div>
        <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent mb-4">
            {isOwn ? `Hey ${displayname}!` : `${displayname}`}
        </h1>
        <p className="text-xl md:text-2xl text-(--text-secondary)">
            {isOwn ? "2025'te neler yaptın bir bakalım..." : `${displayname}'ın 2025 özeti`}
        </p>
    </div>
);

const StatsSlide = ({ stats }: { stats: WrappedData['stats'] }) => (
    <div className="slide-content flex flex-col items-center justify-center">
        <h2 className="text-2xl md:text-3xl font-bold text-(--text-primary) mb-8">📊 2025 İstatistiklerin</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
            <div className="stat-card bg-gradient-to-br from-blue-500 to-cyan-500 p-6 rounded-2xl text-white text-center">
                <div className="text-4xl md:text-5xl font-bold mb-2">
                    <AnimatedCounter end={stats.totalProjects} />
                </div>
                <p className="text-lg opacity-90">Proje Denemesi</p>
            </div>
            <div className="stat-card bg-gradient-to-br from-purple-500 to-pink-500 p-6 rounded-2xl text-white text-center">
                <div className="text-4xl md:text-5xl font-bold mb-2">
                    <AnimatedCounter end={stats.totalReviews + stats.totalFeedbacks} />
                </div>
                <p className="text-lg opacity-90">Topluluk Etkileşimi</p>
            </div>
        </div>
        <div className="mt-8 flex gap-4 flex-wrap justify-center">
            <div className="px-4 py-2 rounded-full bg-(--bg-input) text-(--text-secondary)">
                ✅ {stats.passedProjects} başarılı proje
            </div>
            <div className="px-4 py-2 rounded-full bg-(--bg-input) text-(--text-secondary)">
                📈 Ortalama puan: {stats.avgProjectScore}
            </div>
        </div>
    </div>
);

const MostAttemptedSlide = ({ project, isOwn, ownerName }: { project: WrappedData['highlights']['mostAttemptedProject']; isOwn: boolean; ownerName: string }) => {
    if (!project) return null;
    return (
        <div className="slide-content flex flex-col items-center justify-center text-center">
            <div className="text-6xl mb-6">💪</div>
            <h2 className="text-2xl md:text-3xl font-bold text-(--text-primary) mb-4">
                {isOwn ? 'En Çok Denediğin Proje' : `${ownerName}'ın En Çok Denediği Proje`}
            </h2>
            <div className="bg-gradient-to-br from-orange-500 to-red-500 p-8 rounded-3xl text-white max-w-md w-full">
                <h3 className="text-3xl md:text-4xl font-bold mb-4">{project.name}</h3>
                <div className="flex justify-center gap-6">
                    <div className="text-center">
                        <div className="text-4xl font-bold">{project.attempts}</div>
                        <div className="text-sm opacity-80">deneme</div>
                    </div>
                    {project.retries > 0 && (
                        <div className="text-center">
                            <div className="text-4xl font-bold">{project.retries}</div>
                            <div className="text-sm opacity-80">retry</div>
                        </div>
                    )}
                </div>
            </div>
            <p className="mt-6 text-(--text-secondary) text-lg">Vazgeçmemek güzel şey! 🔥</p>
        </div>
    );
};

const MostReviewedSlide = ({ project, isOwn, ownerName }: { project: WrappedData['highlights']['mostReviewedProject']; isOwn: boolean; ownerName: string }) => {
    if (!project) return null;
    return (
        <div className="slide-content flex flex-col items-center justify-center text-center">
            <div className="text-6xl mb-6">🔍</div>
            <h2 className="text-2xl md:text-3xl font-bold text-(--text-primary) mb-4">
                {isOwn ? 'En Çok Review Ettiğin Proje' : `${ownerName}'ın En Çok Review Ettiği Proje`}
            </h2>
            <div className="bg-gradient-to-br from-cyan-500 to-blue-500 p-8 rounded-3xl text-white max-w-md w-full">
                <h3 className="text-3xl md:text-4xl font-bold mb-4">{project.name}</h3>
                <div className="text-5xl font-bold">{project.count}x</div>
                <p className="text-sm opacity-80 mt-2">review yapıldı</p>
            </div>
            <p className="mt-6 text-(--text-secondary) text-lg">{isOwn ? 'Bu projede artık uzmansın!' : 'Bu projede uzman!'} 🎓</p>
        </div>
    );
};

const TopConnectionsSlide = ({
    mostEvaluated,
    mostEvaluator,
    isOwn,
    ownerName
}: {
    mostEvaluated?: WrappedData['highlights']['mostEvaluatedUser'];
    mostEvaluator?: WrappedData['highlights']['mostEvaluatorUser'];
    isOwn: boolean;
    ownerName: string;
}) => {
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const isSame = mostEvaluated?.login === mostEvaluator?.login;

    if (!mostEvaluated && !mostEvaluator) return null;

    // Determine the correct answer (most total interaction)
    // mostEvaluatedUser = I gave review to them
    // mostEvaluatorUser = I gave feedback to them
    const evaluatedTotal = mostEvaluated ? mostEvaluated.reviewCount : 0;
    const evaluatorTotal = mostEvaluator ? mostEvaluator.feedbackCount : 0;

    // Check if it's a tie
    const isTie = evaluatedTotal === evaluatorTotal && mostEvaluated && mostEvaluator && !isSame;

    const correctAnswer = evaluatedTotal >= evaluatorTotal ? mostEvaluated?.login : mostEvaluator?.login;

    const handleAnswer = (login: string) => {
        if (!selectedAnswer) {
            setSelectedAnswer(login);
        }
    };

    const getCardStyle = (login: string) => {
        if (!selectedAnswer) return '';
        // If it's a tie, both are correct
        if (isTie) return 'ring-4 ring-green-400';
        if (login === correctAnswer) return 'ring-4 ring-green-400';
        if (login === selectedAnswer && login !== correctAnswer) return 'ring-4 ring-red-400 opacity-70';
        return 'opacity-50';
    };

    return (
        <div className="slide-content flex flex-col items-center justify-center text-center">
            <div className="text-6xl mb-6">🤝</div>
            {!selectedAnswer ? (
                <h2 className="text-2xl md:text-3xl font-bold text-(--text-primary) mb-4">
                    {isOwn ? 'Sence en çok kiminle iletişim kurdun?' : `${ownerName} en çok kiminle iletişim kurmuş?`}
                </h2>
            ) : (
                <h2 className="text-2xl md:text-3xl font-bold text-(--text-primary) mb-4">
                    {isTie
                        ? `🤝 Berabere! İkisi de ${evaluatedTotal} kez`
                        : (selectedAnswer === correctAnswer ? '✅ Doğru!' : '❌ Yanlış!')
                    } {!isTie && `En çok iletişim: @${correctAnswer}`}
                </h2>
            )}

            <div className={`flex ${isSame ? 'justify-center' : 'gap-6 flex-wrap justify-center'}`}>
                {mostEvaluated && (
                    <div
                        className={`bg-gradient-to-br from-violet-500 to-purple-600 p-6 rounded-3xl text-white max-w-xs w-full cursor-pointer transition-all ${getCardStyle(mostEvaluated.login)}`}
                        onClick={() => handleAnswer(mostEvaluated.login)}
                    >
                        {mostEvaluated.image && (
                            <img
                                src={mostEvaluated.image.versions.medium || mostEvaluated.image.link}
                                alt={mostEvaluated.login}
                                className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-white/30"
                            />
                        )}
                        <h3 className="text-2xl font-bold mb-2">@{mostEvaluated.login}</h3>
                        <p className="text-sm opacity-80 mb-4">{isOwn ? 'Ona review verdin' : `${ownerName} review verdi`}</p>
                        {selectedAnswer && (
                            <div className="text-center">
                                <div className="text-2xl font-bold">{mostEvaluated.reviewCount}x</div>
                                <div className="text-xs opacity-70">review</div>
                            </div>
                        )}
                        {!selectedAnswer && (
                            <div className="text-center">
                                <div className="text-2xl font-bold">?</div>
                                <div className="text-xs opacity-70">review</div>
                            </div>
                        )}
                        {selectedAnswer && mostEvaluated.login === correctAnswer && (
                            <div className="mt-3 text-3xl">✅</div>
                        )}
                        {selectedAnswer && mostEvaluated.login === selectedAnswer && mostEvaluated.login !== correctAnswer && (
                            <div className="mt-3 text-3xl">❌</div>
                        )}
                    </div>
                )}

                {!isSame && mostEvaluator && (
                    <div
                        className={`bg-gradient-to-br from-pink-500 to-rose-600 p-6 rounded-3xl text-white max-w-xs w-full cursor-pointer transition-all ${getCardStyle(mostEvaluator.login)}`}
                        onClick={() => handleAnswer(mostEvaluator.login)}
                    >
                        {mostEvaluator.image && (
                            <img
                                src={mostEvaluator.image.versions.medium || mostEvaluator.image.link}
                                alt={mostEvaluator.login}
                                className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-white/30"
                            />
                        )}
                        <h3 className="text-2xl font-bold mb-2">@{mostEvaluator.login}</h3>
                        <p className="text-sm opacity-80 mb-4">{isOwn ? 'Ona feedback verdin' : `${ownerName} feedback verdi`}</p>
                        {selectedAnswer && (
                            <div className="text-center">
                                <div className="text-2xl font-bold">{mostEvaluator.feedbackCount}x</div>
                                <div className="text-xs opacity-70">feedback</div>
                            </div>
                        )}
                        {!selectedAnswer && (
                            <div className="text-center">
                                <div className="text-2xl font-bold">?</div>
                                <div className="text-xs opacity-70">feedback</div>
                            </div>
                        )}
                        {selectedAnswer && mostEvaluator.login === correctAnswer && (
                            <div className="mt-3 text-3xl">✅</div>
                        )}
                        {selectedAnswer && mostEvaluator.login === selectedAnswer && mostEvaluator.login !== correctAnswer && (
                            <div className="mt-3 text-3xl">❌</div>
                        )}
                    </div>
                )}
            </div>

            {!selectedAnswer && (
                <p className="mt-6 text-(--text-secondary) text-sm">Kartlardan birine tıkla ve tahminini yap!</p>
            )}
        </div>
    );
};

const MostUsedWordsSlide = ({ words, isOwn, ownerName }: { words?: WrappedData['highlights']['mostUsedWords']; isOwn: boolean; ownerName: string }) => {
    if (!words || words.length === 0) return null;

    const sizes = ['text-5xl', 'text-4xl', 'text-3xl'];
    const colors = ['from-yellow-400 to-orange-500', 'from-green-400 to-cyan-500', 'from-pink-400 to-purple-500'];

    return (
        <div className="slide-content flex flex-col items-center justify-center text-center">
            <div className="text-6xl mb-6">💬</div>
            <h2 className="text-2xl md:text-3xl font-bold text-(--text-primary) mb-8">
                {isOwn ? 'En Çok Kullandığın Kelimeler' : `${ownerName}'ın En Çok Kullandığı Kelimeler`}
            </h2>
            <div className="flex flex-wrap justify-center gap-4 max-w-2xl">
                {words.map((w, i) => (
                    <div
                        key={w.word}
                        className={`${sizes[i] || 'text-2xl'} font-bold bg-gradient-to-r ${colors[i] || 'from-gray-400 to-gray-600'} bg-clip-text text-transparent px-4 py-2`}
                    >
                        "{w.word}" <span className="text-lg text-(--text-tertiary)">({w.count}x)</span>
                    </div>
                ))}
            </div>
            <p className="mt-6 text-(--text-secondary)">Kelimeler çok şey anlatıyor... 🤔</p>
        </div>
    );
};

const MostActiveWeekSlide = ({ week, isOwn, ownerName }: { week?: WrappedData['highlights']['mostActiveWeek']; isOwn: boolean; ownerName: string }) => {
    if (!week) return null;

    const formatWeekDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
    };

    return (
        <div className="slide-content flex flex-col items-center justify-center text-center">
            <div className="text-6xl mb-6">🔥</div>
            <h2 className="text-2xl md:text-3xl font-bold text-(--text-primary) mb-4">
                {isOwn ? 'En Aktif Haftan' : `${ownerName}'ın En Aktif Haftası`}
            </h2>
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-8 rounded-3xl text-white max-w-md w-full">
                <p className="text-lg opacity-80 mb-2">{formatWeekDate(week.week)} haftası</p>
                <div className="text-6xl font-bold mb-4">{week.total}</div>
                <p className="text-lg mb-4">aktivite</p>
                <div className="flex justify-center gap-6 text-sm">
                    <div className="text-center">
                        <div className="text-xl font-bold">{week.projects}</div>
                        <div className="opacity-70">proje</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xl font-bold">{week.reviews}</div>
                        <div className="opacity-70">review</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xl font-bold">{week.feedbacks}</div>
                        <div className="opacity-70">feedback</div>
                    </div>
                </div>
            </div>
            <p className="mt-6 text-(--text-secondary) text-lg">{isOwn ? 'O hafta fena çalışmışsın!' : 'O hafta fena çalışılmış!'} 💪</p>
        </div>
    );
};

const QuietestPeriodSlide = ({ period, isOwn, ownerName }: { period?: WrappedData['highlights']['quietestPeriod']; isOwn: boolean; ownerName: string }) => {
    if (!period) return null;

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    return (
        <div className="slide-content flex flex-col items-center justify-center text-center">
            <div className="text-6xl mb-6">😴</div>
            <h2 className="text-2xl md:text-3xl font-bold text-(--text-primary) mb-4">
                {isOwn ? 'En Sessiz Dönemin' : `${ownerName}'ın En Sessiz Dönemi`}
            </h2>
            <div className="bg-gradient-to-br from-slate-600 to-slate-800 p-8 rounded-3xl text-white max-w-md w-full">
                <div className="text-6xl font-bold mb-2">{period.days}</div>
                <p className="text-xl mb-4">gün mola</p>
                <p className="text-sm opacity-70">{formatDate(period.startDate)} tarihinden itibaren</p>
            </div>
            <p className="mt-6 text-(--text-secondary) text-lg">Herkes dinlenmeyi hak eder! 🌙</p>
        </div>
    );
};

const LabelsSlide = ({ labels, fallbackNotes, isOwn, ownerName }: { labels: string[]; fallbackNotes: string[]; isOwn: boolean; ownerName: string }) => {
    const labelEmojis: Record<string, string> = {
        'Vazgeçmeyen': '💪',
        'Sessiz ama derin': '🧘',
        'Mentor ruhlu': '👨‍🏫',
        'Geri dönen': '🔄',
        'Kendinden emin': '😎',
        'Yeni başlayan': '🌱',
        'Topluluk destekçisi': '🤝',
        'Keşif aşamasında': '🔍'
    };

    return (
        <div className="slide-content flex flex-col items-center justify-center text-center">
            <div className="text-6xl mb-6">🏷️</div>
            <h2 className="text-2xl md:text-3xl font-bold text-(--text-primary) mb-8">
                {isOwn ? 'Senin 2025 Kişiliğin' : `${ownerName}'ın 2025 Kişiliği`}
            </h2>
            <div className="flex flex-wrap justify-center gap-4 max-w-2xl">
                {labels.map((label, i) => (
                    <div
                        key={i}
                        className="px-6 py-3 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-semibold text-lg shadow-lg"
                    >
                        {labelEmojis[label] || '✨'} {label}
                    </div>
                ))}
            </div>
            {fallbackNotes.length > 0 && (
                <div className="mt-8 space-y-2">
                    {fallbackNotes.map((note, i) => (
                        <p key={i} className="text-(--text-secondary) italic">{note}</p>
                    ))}
                </div>
            )}
        </div>
    );
};

const FinalSummarySlide = ({
    data,
    login,
    onCopy,
    onShare,
    summaryRef
}: {
    data: WrappedData;
    login: string;
    onCopy: () => void;
    onShare: () => void;
    summaryRef: React.RefObject<HTMLDivElement | null>;
}) => {
    // Helper to format week date range
    const formatWeekRange = (weekStart: string) => {
        const start = new Date(weekStart);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const formatDate = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        return `${formatDate(start)} - ${formatDate(end)}`;
    };

    return (
        <div className="slide-content flex flex-col items-center justify-center px-4">
            <div
                ref={summaryRef}
                style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)',
                    padding: '1.5rem',
                    borderRadius: '1.5rem',
                    color: 'white',
                    maxWidth: '450px',
                    width: '100%',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                    lineHeight: 1.3,
                    letterSpacing: '0'
                }}
            >
                {/* Header with User Photo */}
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                    {data.user?.image && (
                        <img
                            src={data.user.image.versions.medium || data.user.image.link}
                            alt={data.user.displayname}
                            crossOrigin="anonymous"
                            style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: '50%',
                                margin: '0 auto 0.5rem',
                                border: '3px solid rgba(255,255,255,0.4)',
                                objectFit: 'cover'
                            }}
                        />
                    )}
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 2px 0', lineHeight: 1.2 }}>
                        {data.user?.displayname || login}
                    </h2>
                    <p style={{ fontSize: '0.75rem', opacity: 0.7, margin: 0, lineHeight: 1.2 }}>@{login} • 2025 Wrapped</p>
                </div>

                {/* Summary */}
                <div style={{ textAlign: 'center', marginBottom: '12px', padding: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: '0 0 4px 0', lineHeight: 1.2 }}>{data.summary.headline}</h3>
                    <p style={{ fontSize: '0.8rem', opacity: 0.9, margin: 0, lineHeight: 1.3 }}>{data.summary.shortDescription}</p>
                </div>

                {/* Stats - using flexbox for html2canvas compatibility */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', textAlign: 'center' }}>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.15)', padding: '10px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, lineHeight: 1.1 }}>{data.stats.totalProjects}</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8, margin: 0, lineHeight: 1.2 }}>Proje</div>
                    </div>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.15)', padding: '10px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, lineHeight: 1.1 }}>{data.stats.totalReviews + data.stats.totalFeedbacks}</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8, margin: 0, lineHeight: 1.2 }}>Topluluk Etkileşimi</div>
                    </div>
                </div>

                {/* Additional Stats Row */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', textAlign: 'center' }}>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '6px' }}>
                        <div style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: 0, lineHeight: 1.1 }}>{data.stats.passedProjects}</div>
                        <div style={{ fontSize: '0.625rem', opacity: 0.7, margin: 0, lineHeight: 1.2 }}>Başarılı Proje</div>
                    </div>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '6px' }}>
                        <div style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: 0, lineHeight: 1.1 }}>{data.stats.avgProjectScore}</div>
                        <div style={{ fontSize: '0.625rem', opacity: 0.7, margin: 0, lineHeight: 1.2 }}>Ort. Puan</div>
                    </div>
                </div>

                {/* Highlights */}
                {(data.highlights.mostAttemptedProject || data.highlights.mostReviewedProject || data.highlights.mostActiveWeek) && (
                    <div style={{ marginBottom: '10px', fontSize: '0.7rem', lineHeight: 1.3 }}>
                        {data.highlights.mostAttemptedProject && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <span style={{ opacity: 0.8, margin: 0 }}>💪 En çok denenen:</span>
                                <span style={{ fontWeight: 'bold', margin: 0 }}>{data.highlights.mostAttemptedProject.name} ({data.highlights.mostAttemptedProject.attempts}x)</span>
                            </div>
                        )}
                        {data.highlights.mostReviewedProject && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <span style={{ opacity: 0.8, margin: 0 }}>🔍 En çok review:</span>
                                <span style={{ fontWeight: 'bold', margin: 0 }}>{data.highlights.mostReviewedProject.name} ({data.highlights.mostReviewedProject.count}x)</span>
                            </div>
                        )}
                        {data.highlights.mostActiveWeek && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <span style={{ opacity: 0.8, margin: 0 }}>🔥 En aktif hafta:</span>
                                <span style={{ fontWeight: 'bold', margin: 0 }}>{formatWeekRange(data.highlights.mostActiveWeek.week)}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Top Connections with Images */}
                {(data.highlights.mostEvaluatedUser || data.highlights.mostEvaluatorUser) && (
                    <div style={{ marginBottom: '10px', background: 'rgba(255,255,255,0.1)', padding: '10px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8, marginBottom: '8px', textAlign: 'center', lineHeight: 1.2 }}>🤝 En çok iletişim</div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '0.8rem' }}>
                            {data.highlights.mostEvaluatedUser && (
                                <div style={{ textAlign: 'center' }}>
                                    {data.highlights.mostEvaluatedUser.image && (
                                        <img
                                            src={data.highlights.mostEvaluatedUser.image.versions.small || data.highlights.mostEvaluatedUser.image.link}
                                            alt={data.highlights.mostEvaluatedUser.login}
                                            crossOrigin="anonymous"
                                            style={{ width: '36px', height: '36px', borderRadius: '50%', margin: '0 auto 4px', border: '2px solid rgba(255,255,255,0.3)', objectFit: 'cover', display: 'block' }}
                                        />
                                    )}
                                    <div style={{ fontWeight: 'bold', fontSize: '0.7rem', margin: 0, lineHeight: 1.2 }}>@{data.highlights.mostEvaluatedUser.login}</div>
                                    <div style={{ fontSize: '0.6rem', opacity: 0.7, margin: 0, lineHeight: 1.2 }}>{data.highlights.mostEvaluatedUser.reviewCount}x review</div>
                                </div>
                            )}
                            {data.highlights.mostEvaluatorUser && data.highlights.mostEvaluatorUser.login !== data.highlights.mostEvaluatedUser?.login && (
                                <div style={{ textAlign: 'center' }}>
                                    {data.highlights.mostEvaluatorUser.image && (
                                        <img
                                            src={data.highlights.mostEvaluatorUser.image.versions.small || data.highlights.mostEvaluatorUser.image.link}
                                            alt={data.highlights.mostEvaluatorUser.login}
                                            crossOrigin="anonymous"
                                            style={{ width: '36px', height: '36px', borderRadius: '50%', margin: '0 auto 4px', border: '2px solid rgba(255,255,255,0.3)', objectFit: 'cover', display: 'block' }}
                                        />
                                    )}
                                    <div style={{ fontWeight: 'bold', fontSize: '0.7rem', margin: 0, lineHeight: 1.2 }}>@{data.highlights.mostEvaluatorUser.login}</div>
                                    <div style={{ fontSize: '0.6rem', opacity: 0.7, margin: 0, lineHeight: 1.2 }}>{data.highlights.mostEvaluatorUser.feedbackCount}x feedback</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Labels */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px', marginBottom: '10px' }}>
                    {data.labels.map((label, i) => (
                        <span key={i} style={{ padding: '4px 10px', borderRadius: '9999px', background: 'rgba(255,255,255,0.2)', fontSize: '0.7rem', fontWeight: 500, lineHeight: 1.2, margin: 0 }}>
                            {label}
                        </span>
                    ))}
                </div>

                {/* Footer */}
                <div style={{ textAlign: 'center', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                    <p style={{ fontSize: '0.65rem', opacity: 0.6, margin: 0, lineHeight: 1.2 }}>42watcher.com • 2025</p>
                </div>
            </div>

            {/* Buttons - fixed layout */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                    onClick={onCopy}
                    style={{
                        background: 'white',
                        color: '#7c3aed',
                        padding: '0.75rem 1.25rem',
                        borderRadius: '0.75rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    📋 Kopyala
                </button>
                <button
                    onClick={onShare}
                    style={{
                        background: 'linear-gradient(90deg, #ec4899, #8b5cf6)',
                        color: 'white',
                        padding: '0.75rem 1.25rem',
                        borderRadius: '0.75rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    🔗 Paylaş
                </button>
            </div>
        </div>
    );
};

// Main Component
function Wrapped() {
    const { login } = useParams<{ login: string }>();
    const navigate = useNavigate();
    const { token } = useAuth();
    const [data, setData] = useState<WrappedData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const summaryRef = useRef<HTMLDivElement>(null);

    // Swipe handling
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const minSwipeDistance = 50;

    useEffect(() => {
        const fetchWrapped = async () => {
            setLoading(true);
            setError(null);
            try {
                const apiUrl = import.meta.env.VITE_API_URL || '';
                const response = await axios.get(`${apiUrl}/api/students/${login}?action=wrapped`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (response.data) {
                    setData(response.data);
                } else {
                    setError('Wrapped verisi bulunamadı');
                }
            } catch (err: unknown) {
                const error = err as { response?: { status: number; data?: { message?: string } } };
                if (error.response?.status === 404) {
                    setError('Kullanıcı bulunamadı veya wrapped verisi yok');
                } else if (error.response?.status === 403) {
                    const reason = error.response.data?.message || '';
                    if (reason.includes('banned')) {
                        navigate('/banned', { state: { reason } });
                        return;
                    }
                    setError('Bu sayfaya erişim izniniz yok');
                } else {
                    setError('Bir hata oluştu');
                }
            } finally {
                setLoading(false);
            }
        };

        if (login && token) {
            fetchWrapped();
        }
    }, [login, token, navigate]);

    // Generate slides based on available data
    const handleCopy = async () => {
        if (!summaryRef.current) return;

        try {
            const dataUrl = await domToPng(summaryRef.current, {
                scale: 2,
                backgroundColor: null,
            });

            // Convert data URL to blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();

            if (blob) {
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                    alert('Kart kopyalandı! 📋');
                } catch {
                    // Fallback: download image
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${login}-2025-wrapped.png`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
            }
        } catch (err) {
            console.error('Copy failed:', err);
        }
    };

    const handleShare = async () => {
        if (!summaryRef.current) return;

        try {
            // Generate image
            const dataUrl = await domToPng(summaryRef.current, {
                scale: 2,
                backgroundColor: null,
            });

            // Convert data URL to blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();

            // Create file from blob
            const file = new File([blob], `${login}-2025-wrapped.png`, { type: 'image/png' });

            // Check if Web Share API with files is supported
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: `${data?.user?.displayname || login} - 2025 Wrapped`,
                    text: data?.summary.shortDescription || '2025 yılımın özeti!',
                    files: [file],
                });
            } else if (navigator.share) {
                // Fallback: share without image
                await navigator.share({
                    title: `${login} - 2025 Wrapped`,
                    text: data?.summary.shortDescription || '2025 yılımın özeti!',
                    url: window.location.href,
                });
            } else {
                // Fallback: copy URL
                await navigator.clipboard.writeText(window.location.href);
                alert('Link kopyalandı! 🔗');
            }
        } catch (err) {
            console.error('Share failed:', err);
            // Fallback: copy URL on error
            try {
                await navigator.clipboard.writeText(window.location.href);
                alert('Link kopyalandı! 🔗');
            } catch {
                // Silent fail
            }
        }
    };

    const getSlides = () => {
        if (!data || !login) return [];

        const displayname = data.user?.displayname || login;
        // Check if viewing own wrapped or someone else's (compare user.login with watcherUser.login)
        const isOwnWrapped = data.watcherUser?.login === data.user?.login;

        const slides: React.ReactNode[] = [
            <IntroSlide key="intro" displayname={displayname} isOwn={isOwnWrapped} />
        ];

        slides.push(<StatsSlide key="stats" stats={data.stats} />);

        if (data.highlights.mostAttemptedProject) {
            slides.push(<MostAttemptedSlide key="most-attempted" project={data.highlights.mostAttemptedProject} isOwn={isOwnWrapped} ownerName={displayname} />);
        }

        if (data.highlights.mostReviewedProject) {
            slides.push(<MostReviewedSlide key="most-reviewed" project={data.highlights.mostReviewedProject} isOwn={isOwnWrapped} ownerName={displayname} />);
        }

        if (data.highlights.mostEvaluatedUser || data.highlights.mostEvaluatorUser) {
            slides.push(
                <TopConnectionsSlide
                    key="connections"
                    mostEvaluated={data.highlights.mostEvaluatedUser}
                    mostEvaluator={data.highlights.mostEvaluatorUser}
                    isOwn={isOwnWrapped}
                    ownerName={displayname}
                />
            );
        }

        if (data.highlights.mostUsedWords && data.highlights.mostUsedWords.length > 0) {
            slides.push(<MostUsedWordsSlide key="words" words={data.highlights.mostUsedWords} isOwn={isOwnWrapped} ownerName={displayname} />);
        }

        if (data.highlights.mostActiveWeek) {
            slides.push(<MostActiveWeekSlide key="active-week" week={data.highlights.mostActiveWeek} isOwn={isOwnWrapped} ownerName={displayname} />);
        }

        if (data.highlights.quietestPeriod) {
            slides.push(<QuietestPeriodSlide key="quiet" period={data.highlights.quietestPeriod} isOwn={isOwnWrapped} ownerName={displayname} />);
        }

        slides.push(<LabelsSlide key="labels" labels={data.labels} fallbackNotes={data.fallbackNotes} isOwn={isOwnWrapped} ownerName={displayname} />);

        slides.push(
            <FinalSummarySlide
                key="summary"
                data={data}
                login={login}
                onCopy={handleCopy}
                onShare={handleShare}
                summaryRef={summaryRef}
            />
        );

        return slides;
    };

    const slides = getSlides();

    const goToSlide = (index: number) => {
        if (isAnimating || index < 0 || index >= slides.length) return;
        setIsAnimating(true);
        setCurrentSlide(index);
        setTimeout(() => setIsAnimating(false), 500);
    };

    // Swipe handlers
    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            // Swipe left = next slide
            goToSlide(currentSlide + 1);
        } else if (isRightSwipe) {
            // Swipe right = previous slide
            goToSlide(currentSlide - 1);
        }

        setTouchStart(null);
        setTouchEnd(null);
    };

    if (loading) {
        return (
            <div style={{ backgroundColor: 'var(--bg-primary)' }} className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full border-4 border-purple-500 border-t-transparent animate-spin mb-4"></div>
                    <p className="text-(--text-secondary) text-lg">2025 özeti hazırlanıyor...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div style={{ backgroundColor: 'var(--bg-primary)' }} className="min-h-screen flex items-center justify-center p-4">
                <div className="card max-w-md w-full text-center">
                    <div className="text-6xl mb-4">😢</div>
                    <h2 className="text-2xl font-bold text-(--text-primary) mb-2">Wrapped Bulunamadı</h2>
                    <p className="text-(--text-secondary) mb-6">{error || 'Bu kullanıcının 2025 wrapped verisi yok.'}</p>
                    <button
                        onClick={() => navigate('/students')}
                        className="w-full btn btn-primary"
                    >
                        Öğrencilere Dön
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{ backgroundColor: 'var(--bg-primary)' }}
            className="min-h-screen flex flex-col overflow-hidden"
        >
            {/* Slide Container with swipe support */}
            <div
                className="flex-1 relative overflow-hidden"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {slides.map((slide, index) => (
                    <div
                        key={index}
                        className={`absolute inset-0 overflow-y-auto p-4 md:p-6 transition-all duration-500 ease-out ${index === currentSlide
                            ? 'opacity-100 translate-x-0'
                            : index < currentSlide
                                ? 'opacity-0 -translate-x-full pointer-events-none'
                                : 'opacity-0 translate-x-full pointer-events-none'
                            }`}
                    >
                        <div className="min-h-full flex items-center justify-center py-4">
                            {slide}
                        </div>
                    </div>
                ))}
            </div>

            {/* Navigation */}
            <div className="p-6 flex flex-col items-center gap-4">
                {/* Progress Dots */}
                <div className="flex gap-2">
                    {slides.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => goToSlide(index)}
                            className={`w-2 h-2 rounded-full transition-all ${index === currentSlide
                                ? 'bg-purple-500 w-6'
                                : 'bg-(--text-tertiary) hover:bg-(--text-secondary)'
                                }`}
                        />
                    ))}
                </div>

                {/* Navigation Buttons */}
                <div className="flex gap-4">
                    <button
                        onClick={() => navigate(`/students/${login}`)}
                        className="btn btn-secondary px-4"
                        title="Çıkış"
                    >
                        ✕ Çıkış
                    </button>
                    <button
                        onClick={() => goToSlide(currentSlide - 1)}
                        disabled={currentSlide === 0}
                        className="btn btn-secondary px-6 disabled:opacity-30"
                    >
                        ← Geri
                    </button>
                    <button
                        onClick={() => goToSlide(currentSlide + 1)}
                        disabled={currentSlide === slides.length - 1}
                        className="btn btn-primary px-6 disabled:opacity-30"
                    >
                        İleri →
                    </button>
                    <button
                        onClick={() => goToSlide(slides.length - 1)}
                        disabled={currentSlide === slides.length - 1}
                        className="btn btn-secondary px-4 disabled:opacity-30"
                        title="Sona Git"
                    >
                        ⏭ Son
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Wrapped;
