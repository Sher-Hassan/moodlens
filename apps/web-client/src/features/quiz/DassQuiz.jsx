import { useState } from 'react';
import { QUESTIONS, SECTIONS, OPTIONS, sectionForQuestion, isLastInSection } from './questions';
import './DassQuiz.css';

const TOTAL = QUESTIONS.length; // 21

/**
 * DassQuiz — the full quiz UI.
 *
 * Props:
 *   onComplete(responses) — called with [{questionId, value}, …] when user submits.
 *   onCancel()            — called if user exits mid-quiz.
 */
export default function DassQuiz({ onComplete, onCancel }) {
    // answers[i] is 0-3 or null (unanswered)
    const [answers,   setAnswers]   = useState(() => Array(TOTAL).fill(null));
    const [current,   setCurrent]   = useState(0);   // 0-indexed
    const [direction, setDirection] = useState('right');
    // 'question' | 'section-break' (between sections)
    const [view,      setView]      = useState('question');
    const [nextSection, setNextSection] = useState(null);

    const q = QUESTIONS[current];
    const section = sectionForQuestion(q.id);

    const progress     = ((answers.filter(Boolean !== null ? (a) => a !== null : () => false).length) / TOTAL) * 100;
    const answeredCount = answers.filter((a) => a !== null).length;

    // Section progress (for the three-segment bar)
    const sectionProgress = SECTIONS.map((s) => {
        const qs = QUESTIONS.filter((q) => q.id >= s.range[0] && q.id <= s.range[1]);
        const answered = qs.filter((q) => answers[q.id - 1] !== null).length;
        return { ...s, answered, total: qs.length };
    });

    const selectAnswer = (value) => {
        const updated = [...answers];
        updated[current] = value;
        setAnswers(updated);
    };

    const goNext = () => {
        if (current === TOTAL - 1) return; // handled by submit

        // Check if we're crossing a section boundary
        if (isLastInSection(q.id)) {
            const nextSectionIdx = SECTIONS.findIndex((s) => s.id === section.id) + 1;
            if (nextSectionIdx < SECTIONS.length) {
                setNextSection(SECTIONS[nextSectionIdx]);
                setView('section-break');
                return;
            }
        }

        setDirection('right');
        setCurrent((c) => c + 1);
    };

    const goBack = () => {
        if (current === 0) return;
        setDirection('left');
        setCurrent((c) => c - 1);
    };

    const continueAfterBreak = () => {
        setView('question');
        setDirection('right');
        setCurrent((c) => c + 1);
    };

    const handleSubmit = () => {
        const responses = QUESTIONS.map((q, i) => ({
            questionId: q.id,
            value: answers[i] ?? 0,
        }));
        onComplete(responses);
    };

    const isLast    = current === TOTAL - 1;
    const canGoNext = answers[current] !== null;

    // ── Section break screen ──────────────────────────────
    if (view === 'section-break' && nextSection) {
        return (
            <div className="dass-shell">
                <div className="dass-break" style={{ '--sec-color': nextSection.color, '--sec-soft': nextSection.soft }}>
                    <p className="dass-break__num">Section {SECTIONS.findIndex((s) => s.id === nextSection.id) + 1} of 3</p>
                    <h2 className="dass-break__title">{nextSection.label}</h2>
                    <p className="dass-break__desc">{nextSection.desc}</p>
                    <button className="dass-break__btn" onClick={continueAfterBreak}>
                        Continue <span aria-hidden="true">→</span>
                    </button>
                </div>
            </div>
        );
    }

    // ── Question screen ───────────────────────────────────
    return (
        <div className="dass-shell">

            {/* ── Header: progress + section + cancel ── */}
            <header className="dass-header">
                <button className="dass-cancel" onClick={onCancel} aria-label="Exit quiz">
                    ×
                </button>

                {/* Three-segment progress bar */}
                <div className="dass-progress">
                    {sectionProgress.map((s) => (
                        <progress
                            key={s.id}
                            className="dass-progress__seg"
                            value={s.answered}
                            max={s.total}
                            aria-label={s.label}
                            style={{ '--fill-color': s.color }}
                        />
                    ))}
                </div>

                <span className="dass-header__counter">
                    {current + 1} <span className="dass-header__of">/ {TOTAL}</span>
                </span>
            </header>

            {/* ── Section chip ── */}
            <div
                className="dass-section-chip"
                style={{ '--chip-color': section.color, '--chip-soft': section.soft }}
            >
                {section.label}
            </div>

            {/* ── Question card (key forces remount → re-triggers animation) ── */}
            <div
                key={`${current}-${direction}`}
                className={`dass-card dass-card--from-${direction}`}
                style={{ '--card-color': section.color, '--card-soft': section.soft, '--card-border': section.border }}
            >
                <p className="dass-q-num">Q{q.id}</p>
                <p className="dass-q-text">
                    Over the past week —<br />
                    <span className="dass-q-statement">{q.text}</span>
                </p>

                {/* Response options — 2×2 grid */}
                <div className="dass-options">
                    {OPTIONS.map((opt) => {
                        const selected = answers[current] === opt.value;
                        return (
                            <button
                                key={opt.value}
                                className={`dass-option ${selected ? 'is-selected' : ''}`}
                                style={selected ? {
                                    '--opt-color':  section.color,
                                    '--opt-soft':   section.soft,
                                    '--opt-border': section.border,
                                } : undefined}
                                onClick={() => selectAnswer(opt.value)}
                            >
                                <span className="dass-option__score">{opt.value}</span>
                                <span className="dass-option__label">{opt.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Navigation ── */}
            <nav className="dass-nav">
                <button
                    className="dass-nav__back"
                    onClick={goBack}
                    disabled={current === 0}
                    aria-label="Previous question"
                >
                    ← Back
                </button>

                {isLast ? (
                    <button
                        className="dass-nav__submit"
                        onClick={handleSubmit}
                        disabled={answers[current] === null}
                    >
                        Submit
                    </button>
                ) : (
                    <button
                        className="dass-nav__next"
                        onClick={goNext}
                        disabled={!canGoNext}
                    >
                        Next <span aria-hidden="true">→</span>
                    </button>
                )}
            </nav>

        </div>
    );
}