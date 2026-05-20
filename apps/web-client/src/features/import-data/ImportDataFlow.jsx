import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { useUser } from '../../context/UserContext';
import { useHealthData } from '../../context/HealthDataContext';
import Spinner from '../../components/common/Spinner';
import './ImportDataFlow.css';

import { API_BASE_URL } from '../../config/api';
const POLL_INTERVAL_MS = 4000;
const POLL_PATIENCE = 30; // ~2 minutes before label softens

const STEP = { CHOOSE: 'choose', APP: 'app', FILE: 'file', DONE: 'done' };

function isMobileDevice() {
    return (
        (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) &&
        window.innerWidth <= 1024
    );
}

export default function ImportDataFlow({ onClose, isUpdate = false }) {
    const mobile = isMobileDevice();
    const [step, setStep] = useState(mobile ? STEP.APP : STEP.CHOOSE);

    return (
        <section className="import-flow" role="dialog" aria-modal="false">
            <button
                className="import-flow__close"
                onClick={onClose}
                aria-label="Cancel import"
            >
                ×
            </button>

            <p className="import-flow__eyebrow">
                {isUpdate ? 'Update health data' : 'Import health data'}
            </p>

            {step === STEP.CHOOSE && <ChooseMethod onPick={setStep} />}
            {step === STEP.APP && (
                <ViaApp
                    isMobile={mobile}
                    onSuccess={() => setStep(STEP.DONE)}
                    onBack={mobile ? onClose : () => setStep(STEP.CHOOSE)}
                />
            )}
            {step === STEP.FILE && (
                <ViaFile
                    onSuccess={() => setStep(STEP.DONE)}
                    onBack={() => setStep(STEP.CHOOSE)}
                />
            )}
            {step === STEP.DONE && <DoneState onClose={onClose} />}
        </section>
    );
}

/* ── Step 1: Choose (desktop only) ───────────────── */
function ChooseMethod({ onPick }) {
    return (
        <>
            <h2 className="import-flow__title">
                How would you like to <span className="import-flow__title-em">share it</span>?
            </h2>
            <p className="import-flow__sub">
                Pick whichever is easiest. Both end up in the same place.
            </p>
            <p className="import-flow__notice">
                Processing may take up to 5 minutes — our backend is on a free tier and may need a moment to wake up.
            </p>

            <div className="import-flow__choices">
                <button className="import-choice" onClick={() => onPick(STEP.APP)}>
                    <span className="import-choice__num">01</span>
                    <div className="import-choice__body">
                        <p className="import-choice__title">Via MoodLens shortcut</p>
                        <p className="import-choice__sub">
                            From your iPhone. Add the shortcut, export from Apple Health, and your data arrives here.
                        </p>
                    </div>
                    <span className="import-choice__chev" aria-hidden="true">→</span>
                </button>

                <button className="import-choice" onClick={() => onPick(STEP.FILE)}>
                    <span className="import-choice__num">02</span>
                    <div className="import-choice__body">
                        <p className="import-choice__title">Upload export file</p>
                        <p className="import-choice__sub">
                            From your computer. The .zip or export.xml from Apple Health.
                        </p>
                    </div>
                    <span className="import-choice__chev" aria-hidden="true">→</span>
                </button>
            </div>
        </>
    );
}

// Maps processing phase → { label, progress (0-100) }
const PHASE_META = {
    idle:       { label: 'Listening for your data',          progress: 0   },
    received:   { label: 'Data received — sending to ML engine…', progress: 20  },
    processing: { label: 'Analysing your health records…',   progress: 55  },
    done:       { label: 'Saving records…',                  progress: 90  },
    error:      { label: 'Processing error — retrying…',     progress: 0   },
};

/* ── Step 2a: Via app ─────────────────────────────── */
function ViaApp({ isMobile, onSuccess, onBack }) {
    const { user } = useUser();
    const { refresh } = useHealthData();
    const [polls, setPolls] = useState(0);
    const stopped = useRef(false);

    // Processing state for the progress bar
    const [phase, setPhase] = useState('idle');
    const [progress, setProgress] = useState(0);

    // Token state
    const [credentials, setCredentials] = useState(null);
    const [credLoading, setCredLoading] = useState(false);
    const [copiedId, setCopiedId] = useState(false);
    const [copiedToken, setCopiedToken] = useState(false);

    // Fetch userId + uploadToken on mount
    const fetchCredentials = useCallback(async () => {
        if (!user) return;
        setCredLoading(true);
        try {
            const token = localStorage.getItem('moodlens.token');
            const res = await axios.get(`${API_BASE_URL}/api/upload-token/ensure`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setCredentials({ userId: res.data.userId, uploadToken: res.data.token });
        } catch {
            setCredentials({ userId: user._id, uploadToken: null });
        } finally {
            setCredLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchCredentials();
    }, [fetchCredentials]);

    // Polling — checks both processing phase and data arrival
    useEffect(() => {
        const interval = setInterval(async () => {
            if (stopped.current) return;
            setPolls((p) => p + 1);
            try {
                const token = localStorage.getItem('moodlens.token');

                // Check processing phase first
                const procRes = await axios.get(`${API_BASE_URL}/api/health/processing`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const currentPhase = procRes.data.phase ?? 'idle';
                setPhase(currentPhase);
                const meta = PHASE_META[currentPhase] ?? PHASE_META.idle;
                // Nudge progress forward slightly each poll while active so bar feels alive
                setProgress((p) => {
                    if (currentPhase === 'idle' || currentPhase === 'error') return p;
                    return Math.max(p, Math.min(meta.progress + (p > meta.progress ? 1 : 0), meta.progress + 8));
                });

                // Check for completion
                if (currentPhase === 'done') {
                    const statusRes = await axios.get(`${API_BASE_URL}/api/health/status`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (statusRes.data.hasData) {
                        stopped.current = true;
                        clearInterval(interval);
                        setProgress(100);
                        await refresh();
                        setTimeout(onSuccess, 500);
                    }
                }
            } catch {
                /* silent retry */
            }
        }, POLL_INTERVAL_MS);

        return () => {
            stopped.current = true;
            clearInterval(interval);
        };
    }, [onSuccess, refresh]);

    const copy = (text, setCopied) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const isActive = phase !== 'idle' && phase !== 'error';
    const patientLabel = isActive
        ? (PHASE_META[phase]?.label ?? 'Processing…')
        : polls < POLL_PATIENCE
            ? 'Listening for your data'
            : 'Still listening — leave this open';

    const setupUrl = "https://www.icloud.com/shortcuts/32d33978ecd84a95a2b6382f99c21261";
    const qrCodeApi = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(setupUrl)}&color=edf2f8&bgcolor=131e30`;

    if (isMobile) {
        /* ── Mobile layout ─────────────────────────────── */
        return (
            <>
                <h2 className="import-flow__title">
                    Add the <span className="import-flow__title-em">MoodLens shortcut</span>
                </h2>
                <p className="import-flow__notice">
                    Processing may take up to 5 minutes — the backend may need a moment to wake up on its free tier.
                </p>

                <div className="via-app via-app--mobile">
                    {/* Add Shortcut button */}
                    <div className="via-app__qr-frame">
                        <div className="via-app__qr-ring" />
                        <a
                            href={setupUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="via-app__mobile-btn"
                        >
                            Add MoodLens Shortcut
                        </a>
                    </div>

                    <p className={`via-app__listening-label${isActive ? ' via-app__listening-label--active' : ''}`}>
                        {patientLabel}
                    </p>

                    {isActive && (
                        <div className="via-app__progress">
                            <div className="via-app__progress-bar">
                                <div
                                    className="via-app__progress-fill"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Credentials */}
                    <div className="via-app__creds">
                        <p className="via-app__creds-label">Your credentials for the shortcut</p>

                        {credLoading ? (
                            <p className="via-app__creds-loading">Loading…</p>
                        ) : credentials ? (
                            <>
                                <div className="via-app__cred-row">
                                    <span className="via-app__cred-key">User ID</span>
                                    <span className="via-app__cred-val">{credentials.userId}</span>
                                    <button
                                        className={`via-app__cred-copy ${copiedId ? 'copied' : ''}`}
                                        onClick={() => copy(credentials.userId, setCopiedId)}
                                    >
                                        {copiedId ? '✓ Copied' : 'Copy'}
                                    </button>
                                </div>

                                <div className="via-app__cred-row">
                                    <span className="via-app__cred-key">Upload Token</span>
                                    <span className="via-app__cred-val via-app__cred-val--token">
                                        {credentials.uploadToken
                                            ? `${credentials.uploadToken.slice(0, 8)}…${credentials.uploadToken.slice(-4)}`
                                            : 'Unavailable'}
                                    </span>
                                    {credentials.uploadToken && (
                                        <button
                                            className={`via-app__cred-copy ${copiedToken ? 'copied' : ''}`}
                                            onClick={() => copy(credentials.uploadToken, setCopiedToken)}
                                        >
                                            {copiedToken ? '✓ Copied' : 'Copy'}
                                        </button>
                                    )}
                                </div>
                            </>
                        ) : null}
                    </div>

                    <div className="via-app__foot">
                        <button className="link-btn" onClick={onBack}>
                            ← Back
                        </button>
                    </div>
                </div>
            </>
        );
    }

    /* ── Desktop layout ───────────────────────────── */
    return (
        <>
            <h2 className="import-flow__title">
                Set up <span className="import-flow__title-em">your shortcut</span>
            </h2>
            <div className="via-app">
                <div className="via-app__qr-frame">
                    <div className="via-app__qr-ring" />
                    <img
                        src={qrCodeApi}
                        alt="Scan to set up MoodLens Shortcut"
                        className="via-app__qr-image"
                        loading="eager"
                    />
                </div>

                <p className={`via-app__listening-label${isActive ? ' via-app__listening-label--active' : ''}`}>
                    {patientLabel}
                </p>

                {isActive && (
                    <div className="via-app__progress">
                        <div className="via-app__progress-bar">
                            <div
                                className="via-app__progress-fill"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}

                <p className="via-app__notice">
                    This may take up to 5 minutes — the backend may need a moment to wake up on its free tier.
                </p>

                <ol className="via-app__steps">
                    <li>
                        <span className="via-app__step-num">1</span>
                        <span>Scan the QR code with your iPhone to add the MoodLens shortcut.</span>
                    </li>
                    <li>
                        <span className="via-app__step-num">2</span>
                        <span>When prompted, the shortcut will ask for your <span className="via-app__hl">User ID</span> and <span className="via-app__hl">Upload Token</span>.</span>
                    </li>
                    <li>
                        <span className="via-app__step-num">3</span>
                        <span>On your phone, open MoodLens in your browser, log in, and tap <span className="via-app__hl">Import Data</span>. Your credentials will be shown there — copy and paste them into the shortcut.</span>
                    </li>
                    <li>
                        <span className="via-app__step-num">4</span>
                        <span>In Apple Health, tap your profile → <span className="via-app__hl">Export All Health Data</span> → scroll down and select <span className="via-app__hl">MoodLens</span>.</span>
                    </li>
                    <li>
                        <span className="via-app__step-num">5</span>
                        <span>Your data will upload automatically. This page will advance once it arrives.</span>
                    </li>
                </ol>

                <div className="via-app__foot">
                    <button className="link-btn" onClick={onBack}>
                        ← Choose another way
                    </button>
                </div>
            </div>
        </>
    );
}

/* ── Step 2b: Via file ────────────────────────────── */
function ViaFile({ onSuccess, onBack }) {
    const { user } = useUser();
    const { refresh } = useHealthData();
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [phase, setPhase] = useState('');
    const [error, setError] = useState('');
    const inputRef = useRef(null);
    const stopped = useRef(false);

    const onDrop = (e) => {
        e.preventDefault();
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) setFile(dropped);
    };

    const start = async () => {
        if (!file || !user) return;
        setError('');
        setUploading(true);
        setProgress(0);
        setPhase('Uploading');
        stopped.current = false;

        try {
            const token = localStorage.getItem('moodlens.token');
            const fd = new FormData();
            fd.append('file', file);
            fd.append('userId', user._id);

            // Phase 1: upload to API (0 → 60%)
            await axios.post(`${API_BASE_URL}/api/health/upload`, fd, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                },
                onUploadProgress: (e) => {
                    if (e.total) {
                        const pct = (e.loaded / e.total) * 60;
                        setProgress((p) => Math.max(p, pct));
                    }
                },
            });

            // API returned 202 — file is being processed in the background.
            // Phase 2: poll /status until records appear (60 → 95%)
            setPhase('Processing on the server');
            setProgress(60);

            await new Promise((resolve, reject) => {
                let polls = 0;
                const nudge = setInterval(() => {
                    setProgress((p) => (p < 95 ? p + 0.4 : p));
                }, 500);

                const interval = setInterval(async () => {
                    if (stopped.current) {
                        clearInterval(interval);
                        clearInterval(nudge);
                        return;
                    }
                    polls++;
                    try {
                        const res = await axios.get(`${API_BASE_URL}/api/health/status`, {
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        if (res.data.hasData) {
                            clearInterval(interval);
                            clearInterval(nudge);
                            resolve();
                        }
                    } catch {
                        /* silent retry */
                    }
                    if (polls > 120) {
                        clearInterval(interval);
                        clearInterval(nudge);
                        reject(new Error('Processing is taking longer than expected. Your data will appear once the server finishes — try refreshing in a minute.'));
                    }
                }, 5000);
            });

            setProgress(100);
            setPhase('Done');
            await refresh();
            setTimeout(onSuccess, 450);
        } catch (err) {
            stopped.current = true;
            setError(
                err.response?.data?.error ||
                    err.response?.data?.details ||
                    err.message ||
                    'Upload failed.'
            );
            setUploading(false);
        }
    };

    return (
        <>
            <h2 className="import-flow__title">
                Upload your <span className="import-flow__title-em">export</span>
            </h2>
            <p className="import-flow__sub">
                Drop the .zip or export.xml file straight from Apple Health.
            </p>
            <p className="import-flow__notice">
                Processing may take up to 5 minutes — the backend may need a moment to wake up on its free tier.
            </p>

            <div
                className={`via-file__drop ${file ? 'has-file' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => !uploading && inputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Choose health export file"
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".xml,.zip,application/zip,text/xml"
                    hidden
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {!file ? (
                    <>
                        <p className="via-file__drop-title">Drop file here</p>
                        <p className="via-file__drop-sub">or click to browse</p>
                    </>
                ) : (
                    <div className="via-file__file">
                        <p className="via-file__file-name">{file.name}</p>
                        <p className="via-file__file-meta">
                            {(file.size / (1024 * 1024)).toFixed(1)} MB · ready
                        </p>
                    </div>
                )}
            </div>

            {uploading && (
                <div className="via-file__progress">
                    <div className="via-file__progress-bar">
                        <div
                            className="via-file__progress-fill"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="via-file__progress-label">
                        {phase}
                        <span> · {Math.round(progress)}%</span>
                    </p>
                </div>
            )}

            {error && (
                <div className="via-file__error" role="alert">
                    <span className="via-file__error-dot" />
                    {error}
                </div>
            )}

            <div className="via-file__actions">
                <button className="link-btn" onClick={onBack} disabled={uploading}>
                    ← Back
                </button>
                <button
                    className="primary-btn"
                    onClick={start}
                    disabled={!file || uploading}
                >
                    {uploading ? (
                        <>
                            <span className="primary-btn__spinner" /> Working
                        </>
                    ) : (
                        <>
                            Begin upload <span aria-hidden="true">→</span>
                        </>
                    )}
                </button>
            </div>
        </>
    );
}

/* ── Step 3: Done ─────────────────────────────────── */
function DoneState({ onClose }) {
    return (
        <div className="done-state">
            <div className="done-state__check" aria-hidden="true">
                <svg viewBox="0 0 32 32" width="32" height="32">
                    <path
                        d="M8 17l5 5 11-12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>
            <h2 className="import-flow__title done-state__title">
                <span className="import-flow__title-em">Done.</span>
            </h2>
            <p className="import-flow__sub">
                Your data is in. Insights will appear across Dashboard, Physical, and Mental.
            </p>
            <button className="primary-btn" onClick={onClose}>
                Continue
            </button>
        </div>
    );
}
