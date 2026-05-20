import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useUser } from '../../context/UserContext';
import { useHealthData } from '../../context/HealthDataContext';
import Spinner from '../../components/common/Spinner';
import './ImportDataFlow.css';

import { API_BASE_URL } from '../../config/api';
const POLL_INTERVAL_MS = 4000;
const POLL_PATIENCE = 30; // ~2 minutes before label softens

const STEP = { CHOOSE: 'choose', APP: 'app', FILE: 'file', DONE: 'done' };

export default function ImportDataFlow({ onClose, isUpdate = false }) {
    const [step, setStep] = useState(STEP.CHOOSE);

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
                    onSuccess={() => setStep(STEP.DONE)}
                    onBack={() => setStep(STEP.CHOOSE)}
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

/* ── Step 1: Choose ───────────────────────────────── */
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
                            From your iPhone. Tap the shortcut, your data flies straight here.
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

/* ── Step 2a: Via app ─────────────────────────────── */
function ViaApp({ onSuccess, onBack }) {
    const { refresh } = useHealthData();
    const [polls, setPolls] = useState(0);
    const stopped = useRef(false);

    useEffect(() => {
        const interval = setInterval(async () => {
            if (stopped.current) return;
            setPolls((p) => p + 1);
            try {
                const token = localStorage.getItem('moodlens.token');
                const res = await axios.get(`${API_BASE_URL}/api/health/status`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.hasData) {
                    stopped.current = true;
                    clearInterval(interval);
                    await refresh();
                    onSuccess();
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

    const patientLabel =
        polls < POLL_PATIENCE
            ? 'Listening for your data'
            : 'Still listening — leave this open';

    // NEW: Point to our setup page instead of directly to iCloud
    // const setupUrl = window.location.origin + '/shortcut-setup';
    const setupUrl = "https://www.icloud.com/shortcuts/32d33978ecd84a95a2b6382f99c21261";
    const qrCodeApi = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(setupUrl)}&color=edf2f8&bgcolor=131e30`;

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

                    <a 
                        href={setupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="via-app__mobile-btn"
                    >
                        Set Up Shortcut
                    </a>
                </div>
                
                <p className="via-app__listening-label">{patientLabel}</p>
                <p className="via-app__notice">
                    This may take up to 5 minutes — the backend may need a moment to wake up on its free tier.
                </p>

                <ol className="via-app__steps">
                    <li>
                        <span className="via-app__step-num">1</span>
                        <span className="via-app__desktop-only">Scan the code to begin setup</span>
                        <span className="via-app__mobile-only">Tap "Add Shortcut"</span>
                    </li>
                    <li>
                        <span className="via-app__step-num">2</span>
                        Go to Moodlens.com and login
                    </li>
                    <li>
                        <span className="via-app__step-num">3</span>
                        tap on your profile and go to iOS Shortcut
                    </li>
                    <li>
                        <span className="via-app__step-num">4</span>
                        Copy your User Id and Upload Token
                    </li>
                    <li>
                        <span className="via-app__step-num">5</span>
                        Go to Apple health, tap on your profile, scroll down and tap <br />Export All Health Data, scroll down and select MoodLens.
                    </li>
                    <li>
                        <span className="via-app__step-num">5</span>
                        Paste your User Id and Upload Token when prompted
                    </li>
                    <li>
                        
                        Your Health data will be uploaded
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
                // Nudge the bar slowly while waiting
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
                    // Give up after ~10 minutes (120 × 5 s) and let user retry
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
