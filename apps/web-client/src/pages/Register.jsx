import { useState } from "react";
import axios from "axios";
import { API_BASE_URL } from '../config/api';
import { Link, useNavigate } from "react-router-dom";
import "./Login.css";
import "./Register.css";

function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    age: "",
    gender: "",
    weightKg: "",
    stepGoal: 10000,
    sleepGoalHours: 8,
    activeEnergyGoal: 500,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // Password strength: 0 weak · 1 medium · 2 strong
  function pwdStrength(pwd) {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return 0;   // weak
    if (score === 2) return 1;  // medium
    return 2;                   // strong
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validate() {
    if (!EMAIL_RE.test(form.email)) {
      return "Enter a valid email address (e.g. you@domain.com).";
    }
    if (pwdStrength(form.password) < 1) {
      return "Password is too weak — use 8+ characters with uppercase, lowercase, and a number.";
    }
    return null;
  }

  const strength = pwdStrength(form.password);
  const strengthLabel = ["Weak", "Medium", "Strong"][strength];
  const strengthColor = ["var(--red-core,#f87171)", "var(--amber-core,#fbbf24)", "var(--teal-glow)"][strength];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        profile: {
          age: form.age ? Number(form.age) : undefined,
          gender: form.gender || undefined,
          weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        },
        goals: {
          stepGoal: form.stepGoal ? Number(form.stepGoal) : 10000,
          sleepGoalHours: form.sleepGoalHours
            ? Number(form.sleepGoalHours)
            : 8,
          activeEnergyGoal: form.activeEnergyGoal
            ? Number(form.activeEnergyGoal)
            : 500,
        },
      };
      await axios.post(`${API_BASE_URL}/api/users/register`, payload);
      setSuccess("Account created. Routing you to sign in…");
      setTimeout(() => navigate("/login"), 1100);
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth">
      {/* ─ Left: form ─ */}
      <section className="auth__panel auth__panel--form">
        <Link to="/" className="auth__brand">
          <span className="auth__brand-mark" />
          <span className="auth__brand-word">
            MoodLens<span className="auth__brand-dot">.</span>
          </span>
        </Link>

        <div className="auth__form-wrap register__form-wrap">
          <p className="auth__eyebrow">Step one of one</p>
          <h1 className="auth__title">
            Let's <span className="auth__title-em">begin.</span>
          </h1>
          <p className="auth__sub">
            A few details so we can interpret your signal correctly. Goals are
            adjustable later.
          </p>

          <form className="auth__form" onSubmit={handleSubmit} noValidate>
            {/* Section 1: Account */}
            <div className="auth__section">
              <div className="auth__section-head">
                <span className="auth__section-num">01</span>
                <span className="auth__section-title">Account</span>
              </div>

              <Field
                label="Full name"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="Your name"
                autoComplete="name"
              />

              <Field
                label="Email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="you@domain.com"
                autoComplete="email"
              />

              <Field
                label="Password"
                name="password"
                type={showPwd ? "text" : "password"}
                value={form.password}
                onChange={handleChange}
                required
                placeholder="8+ chars, upper, lower, number"
                autoComplete="new-password"
                suffix={
                  <button
                    type="button"
                    className="auth__field-toggle"
                    onClick={() => setShowPwd((v) => !v)}
                    aria-label={showPwd ? "Hide password" : "Show password"}
                  >
                    {showPwd ? "Hide" : "Show"}
                  </button>
                }
              />
              {form.password && (
                <div className="register__pwd-strength">
                  <div className="register__pwd-bars">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="register__pwd-bar"
                        style={{ background: i <= strength ? strengthColor : undefined }}
                      />
                    ))}
                  </div>
                  <span className="register__pwd-label" style={{ color: strengthColor }}>
                    {strengthLabel}
                  </span>
                </div>
              )}
            </div>

            {/* Section 2: Profile */}
            <div className="auth__section">
              <div className="auth__section-head">
                <span className="auth__section-num">02</span>
                <span className="auth__section-title">Profile</span>
                <span className="register__section-optional">optional</span>
              </div>

              <div className="auth__grid-2">
                <Field
                  label="Age"
                  name="age"
                  type="number"
                  value={form.age}
                  onChange={handleChange}
                  placeholder="—"
                  mono
                  min={0}
                />
                <SelectField
                  label="Gender"
                  name="gender"
                  value={form.gender}
                  onChange={handleChange}
                  options={[
                    { value: "", label: "Select…" },
                    { value: "Male", label: "Male" },
                    { value: "Female", label: "Female" },
                    { value: "Other", label: "Other" },
                  ]}
                />
              </div>

              <Field
                label="Weight"
                name="weightKg"
                type="number"
                value={form.weightKg}
                onChange={handleChange}
                placeholder="—"
                mono
                min={0}
                suffix={<span className="register__suffix-unit">kg</span>}
              />
            </div>

            {/* Section 3: Goals */}
            <div className="auth__section">
              <div className="auth__section-head">
                <span className="auth__section-num">03</span>
                <span className="auth__section-title">Daily goals</span>
                <span className="register__section-optional">tunable later</span>
              </div>

              <Field
                label="Steps per day"
                name="stepGoal"
                type="number"
                value={form.stepGoal}
                onChange={handleChange}
                mono
                min={0}
                suffix={<span className="register__suffix-unit">steps</span>}
              />

              <div className="auth__grid-2">
                <Field
                  label="Sleep"
                  name="sleepGoalHours"
                  type="number"
                  value={form.sleepGoalHours}
                  onChange={handleChange}
                  mono
                  min={0}
                  step="0.5"
                  suffix={<span className="register__suffix-unit">hrs</span>}
                />
                <Field
                  label="Active energy"
                  name="activeEnergyGoal"
                  type="number"
                  value={form.activeEnergyGoal}
                  onChange={handleChange}
                  mono
                  min={0}
                  suffix={<span className="register__suffix-unit">kcal</span>}
                />
              </div>
            </div>

            {error && (
              <div className="auth__error" role="alert">
                <span className="auth__error-dot" />
                {error}
              </div>
            )}
            {success && (
              <div className="auth__success" role="status">
                {success}
              </div>
            )}

            <button
              type="submit"
              className="auth__submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="auth__spinner" /> Creating account…
                </>
              ) : (
                <>
                  Create account <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </form>

          <p className="auth__alt">
            Already on MoodLens?{" "}
            <Link to="/login" className="auth__alt-link">
              Sign in
            </Link>
          </p>
        </div>

        <footer className="auth__foot">
          <span>MOODLENS · 2026</span>
          <span>PRIVACY · LOCAL FIRST</span>
        </footer>
      </section>

      {/* ─ Right: visualization ─ */}
      <aside className="auth__panel auth__panel--art" aria-hidden="true">
        <div className="auth__art-aurora" />
        <div className="auth__art-grain" />

        <div className="auth__art-meta auth__art-meta--tr">
          <span className="auth__art-dot" />
          <span>CALIBRATING</span>
        </div>

        <div className="auth__art-meta auth__art-meta--bl">
          <span>SIGNAL · 3 STREAMS</span>
          <span className="auth__art-sep">·</span>
          <span>READY</span>
        </div>

        <div className="auth__rings">
          <span className="auth__ring" />
          <span className="auth__ring auth__ring--2" />
          <span className="auth__ring auth__ring--3" />
        </div>

        <blockquote className="auth__quote">
          <span className="auth__quote-mark" aria-hidden="true">
            &ldquo;
          </span>
          Three signals. Sleep, motion, energy. Together they say more than
          any one alone.
        </blockquote>
      </aside>
    </main>
  );
}

/* ──────────────────────────────────────────────────── */
/* Local field components                              */
/* ──────────────────────────────────────────────────── */

function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
  suffix,
  mono,
  min,
  step,
}) {
  return (
    <label className="auth__field">
      <span className="auth__field-label">
        {label}
        {required && <span className="auth__field-req">*</span>}
      </span>
      <span className="auth__field-input-wrap">
        <input
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          min={min}
          step={step}
          className={`auth__field-input${mono ? " auth__field-input--mono" : ""}`}
        />
        {suffix && <span className="auth__field-suffix">{suffix}</span>}
      </span>
    </label>
  );
}

function SelectField({ label, name, value, onChange, options, required }) {
  return (
    <label className="auth__field">
      <span className="auth__field-label">
        {label}
        {required && <span className="auth__field-req">*</span>}
      </span>
      <span className="auth__field-input-wrap">
        <select
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          className="auth__field-input"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

export default Register;