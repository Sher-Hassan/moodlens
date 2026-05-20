import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Spinner from '../../components/common/Spinner';
import DassQuiz from '../quiz/DassQuiz';
import QuizResults from '../quiz/QuizResults';
import WellnessGauge from './components/WellnessGauge';
import RecoveryRadar from './components/RecoveryRadar';
import BurnoutTimeline from './components/BurnoutTimeline';
import BehavioralHeatmap from './components/BehavioralHeatmap';
import AIInsights from './components/AIInsights';
import MoodForecast from './components/MoodForecast';
import InfoTooltip from './components/InfoTooltip';
import AISummary from './components/AISummary';

import './components/ai.css';
import './MentalAnalysisPage.css';
import { API_BASE_URL } from '../../config/api';

/**
 * Small helper: card header with built-in ⓘ tooltip
 */
function CardHeader({ eyebrow, title, badge = 'AI', info }) {
    return (
        <div className="ai-card__header">
            <div>
                <p className="ai-card__eyebrow">{eyebrow}</p>
                <div className="ai-card__title-row">
                    <h3 className="ai-card__title">{title}</h3>
                    {info && <InfoTooltip {...info} />}
                </div>
            </div>
            <span className="ai-card__badge">{badge}</span>
        </div>
    );
}

/**
 * Tooltip copy for every chart in the Mental tab.
 * Centralized so it's easy to revise and translate later.
 */
const TIPS = {
    wellness: {
        what: 'A single 0–100 score combining your DASS-21 results with your recent sleep, activity, and energy.',
        how:  'Higher is better. Green/teal = healthy range, amber = moderate concern, red = needs attention.',
        why:  'Synthesizes 5+ signals into one number you can track day to day. The trend matters more than any single value.',
    },
    recovery: {
        what: 'A 5-axis radar of your recovery dimensions: sleep, stress, anxiety, activity, and emotional balance.',
        how:  'Each spoke is 0–100. A balanced pentagon = even recovery. Pinched spokes = your weak areas. The "FOCUS HERE" callout names the lowest axis.',
        why:  'Average scores hide imbalance. Two people with a 70 average can have very different shapes — fixing the weak axis is what moves the score.',
    },
    burnout: {
        what: 'Daily burnout-risk score over time, with stress and sleep as supporting context lines.',
        how:  'Background bands mark risk zones: green = healthy, yellow = mild fatigue, orange = burnout risk, red = severe. Watch for sustained climbing.',
        why:  'Burnout isn\'t one bad day — it\'s a pattern. This chart surfaces the trend before it hits a crisis, when small changes still help.',
    },
    heatmap: {
        what: 'A weekly calendar grid showing your patterns by day-of-week and week-of-year. Choose wellness, stress, sleep, or activity.',
        how:  'Darker = higher value of the selected metric. Scan for vertical stripes — same weekday consistently dark/light reveals weekly rituals or slumps.',
        why:  'Catches "weekly rhythm" problems invisible in a daily line chart (e.g. "I\'m always low on Tuesdays" or "weekends wreck my sleep").',
    },
    forecast: {
        what: 'A 7-day forecast for each of wellness, stress, anxiety, and depression, with a confidence band showing the expected range.',
        how:  'Solid line = your actual recent history. Dashed line = predicted future. Shaded band = uncertainty range. "Higher is better" tag at top tells you which direction you want the line going.',
        why:  'Gives you a heads-up on where current habits will land you. Changes < 3 points are within model noise — only act on bigger shifts.',
    },
};

export default function MentalAnalysisPage() {
    const [phase, setPhase] = useState('loading');
    const [assessment, setAssessment] = useState(null);
    const [error, setError] = useState('');
    const [aiData, setAiData] = useState(null);
    const [aiLoading, setAiLoading] = useState(true);
    const [aiError, setAiError] = useState(null);

    const fetchAI = useCallback(async () => {
        setAiLoading(true);
        setAiError(null);
        try {
            const token = localStorage.getItem('moodlens.token');
            const res = await axios.get(`${API_BASE_URL}/api/ai/mental-wellness`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data?.error) {
                setAiError(res.data);
                setAiData(null);
            } else {
                setAiData(res.data);
                setAiError(null);
            }
        } catch (err) {
            console.error('❌ [AI] Fetch failed:', err);
            setAiError({ message: 'Could not load AI analysis' });
            setAiData(null);
        } finally {
            setAiLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const token = localStorage.getItem('moodlens.token');
                const res = await axios.get(`${API_BASE_URL}/api/assessments/latest`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (cancelled) return;
                if (res.data.assessment) {
                    setAssessment(res.data.assessment);
                    setPhase('results');
                } else {
                    setPhase('no-quiz');
                }
            } catch {
                if (!cancelled) setPhase('no-quiz');
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        fetchAI();
    }, [fetchAI]);

    const handleQuizComplete = useCallback(async (responses) => {
        setPhase('submitting');
        setError('');
        try {
            const token = localStorage.getItem('moodlens.token');
            const res = await axios.post(
                `${API_BASE_URL}/api/assessments`,
                { responses },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            setAssessment(res.data.assessment);
            setPhase('results');
            fetchAI();
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Submission failed.');
            setPhase('quiz');
        }
    }, [fetchAI]);

    const startOver = () => {
        setAssessment(null);
        setPhase('disclaimer');
    };

    if (phase === 'loading') {
        return (
            <div className="mental-center">
                <Spinner size="lg" label="Checking your records…" />
            </div>
        );
    }

    if (phase === 'no-quiz') {
        return (
            <div className="mental-center">
                <div className="mental-prompt">
                    <span className="mental-prompt__glyph" aria-hidden="true">◉</span>
                    <p className="mental-prompt__eyebrow">Mental analysis</p>
                    <h2 className="mental-prompt__title">
                        Understand your<br />
                        <span className="mental-prompt__title-em">mental landscape.</span>
                    </h2>
                    <p className="mental-prompt__body">
                        The DASS-21 is a clinically validated 21-question check-in that
                        measures depression, anxiety, and stress. It takes about 3 minutes.
                        Your scores are stored alongside your health data and will power
                        the full mental analysis view.
                    </p>
                    <button className="mental-prompt__btn" onClick={() => setPhase('disclaimer')}>
                        Take the quiz
                        <span aria-hidden="true">→</span>
                    </button>
                </div>
            </div>
        );
    }

    if (phase === 'disclaimer') {
        return (
            <div className="mental-center">
                <div className="mental-disclaimer">
                    <p className="mental-disclaimer__eyebrow">Before you begin</p>
                    <h2 className="mental-disclaimer__title">A quick note</h2>
                    <p className="mental-disclaimer__body">
                        The DASS-21 is a self-report scale intended for informational
                        and research purposes. It is <strong>not a clinical diagnosis</strong>.
                        Answer each question based on how you felt over the <strong>past week</strong>.
                        There are no right or wrong answers.
                    </p>
                    <p className="mental-disclaimer__body">
                        If you are currently in distress or experiencing a mental health
                        crisis, please reach out to a qualified professional or emergency
                        services rather than taking this quiz.
                    </p>
                    <div className="mental-disclaimer__actions">
                        <button className="mental-disclaimer__cancel" onClick={() => setPhase('no-quiz')}>
                            Cancel
                        </button>
                        <button className="mental-disclaimer__start" onClick={() => setPhase('quiz')}>
                            I understand, let's begin
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (phase === 'quiz') {
        return (
            <>
                {error && (
                    <div className="mental-error-bar" role="alert">
                        <span /> {error}
                    </div>
                )}
                <DassQuiz
                    onComplete={handleQuizComplete}
                    onCancel={() => setPhase('no-quiz')}
                />
            </>
        );
    }

    if (phase === 'submitting') {
        return (
            <div className="mental-center">
                <Spinner size="lg" label="Storing your results…" />
            </div>
        );
    }

    if (phase === 'results' && assessment) {
        return (
            <>
                <QuizResults assessment={assessment} onRetake={startOver} />

                {/* ── AI Wellness Analysis ────────────────── */}
                {aiLoading ? (
                    <div className="ai-empty">
                        <p className="ai-empty__text">Analyzing your wellness data...</p>
                    </div>
                ) : aiError ? (
                    <div className="ai-empty">
                        <h3 className="ai-empty__title">Analysis unavailable</h3>
                        <p className="ai-empty__text">{aiError.message}</p>
                    </div>
                ) : aiData ? (
                    <>
                        <section className="ai-section">
                            <div className="ai-card">
                                <CardHeader
                                    eyebrow="Mental Wellness"
                                    title="Overall Score"
                                    info={TIPS.wellness}
                                />
                                <WellnessGauge wellness={aiData.wellness} />
                            </div>

                            <div className="ai-card ai-card--mental">
                                <CardHeader
                                    eyebrow="Recovery"
                                    title="5-Axis Analysis"
                                    info={TIPS.recovery}
                                />
                                <RecoveryRadar recovery={aiData.recovery} />
                            </div>

                            <AIInsights
                                insights={aiData.insights}
                                metadata={aiData.metadata}
                                anomaly={aiData.anomaly}
                                cluster={aiData.cluster}
                            />
                        </section>

                        {aiData.burnoutTimeline?.length > 0 && (
                            <section className="ai-section">
                                <div className="ai-card ai-card--full ai-card--burnout">
                                    <CardHeader
                                        eyebrow="Burnout Detection"
                                        title="Emotional Exhaustion Timeline"
                                        info={TIPS.burnout}
                                    />
                                    <BurnoutTimeline timeline={aiData.burnoutTimeline} />
                                </div>
                            </section>
                        )}

                        {aiData.heatmap?.weeks?.length > 0 && (
                            <section className="ai-section">
                                <div className="ai-card ai-card--full ai-card--heatmap">
                                    <CardHeader
                                        eyebrow="Behavioral Patterns"
                                        title="Weekly Heatmap"
                                        info={TIPS.heatmap}
                                    />
                                    <BehavioralHeatmap heatmap={aiData.heatmap} />
                                </div>
                            </section>
                        )}

                        {aiData.moodForecast && (
                            <section className="ai-section">
                                <div className="ai-card ai-card--full ai-card--forecast">
                                    <CardHeader
                                        eyebrow="Mood Forecast"
                                        title="Next 7 Days"
                                        info={TIPS.forecast}
                                    />
                                    <MoodForecast moodForecast={aiData.moodForecast} />
                                </div>
                            </section>
                        )}
                        <AISummary type="mental" />
                    </>
                ) : null}
            </>
        );
    }

    return null;
}
